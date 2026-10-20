using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Repositories;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Dapper;
using Microsoft.Data.SqlClient;

namespace AstraMentoring_Backend.Services
{
    public class AuthService
    {
        private readonly IGenericRepository<User> _userRepo;
        private readonly IGenericRepository<MenteeProfile> _menteeRepo;
        private readonly IGenericRepository<MentorProfile> _mentorRepo;
        private readonly IGenericRepository<MentorMentee> _mentorMenteeRepo;
        private readonly IConfiguration _config;
        private readonly string _connectionString;

        public AuthService(
            IGenericRepository<User> userRepo,
            IGenericRepository<MenteeProfile> menteeRepo,
            IGenericRepository<MentorProfile> mentorRepo,
            IGenericRepository<MentorMentee> mentorMenteeRepo,
            IConfiguration config)
        {
            _userRepo = userRepo;
            _menteeRepo = menteeRepo;
            _mentorRepo = mentorRepo;
            _mentorMenteeRepo = mentorMenteeRepo;
            _config = config;
            _connectionString = config.GetConnectionString("DefaultConnection")
                ?? "Server=(localdb)\\MSSQLLocalDB;Database=AstraMentoring;Trusted_Connection=True;MultipleActiveResultSets=True";
        }

        public string HashPassword(string password)
            => BCrypt.Net.BCrypt.HashPassword(password);

        // Shared by RegisterAsync (Admin's own "add user" tool), and
        // RegisterMenteeAsync/RegisterMentorAsync below — all three build a
        // User row straight from client input with nothing else checking
        // FirstName/LastName/Email. The Add User form already enforces this
        // client-side, but that's UI convenience, not a server-side
        // guarantee, so a raw API call could otherwise create a row with a
        // blank name or a malformed email.
        public static string? ValidateRegistration(UserRegisterRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.FirstName) || string.IsNullOrWhiteSpace(request.LastName))
                return "First name and last name are required.";
            if (string.IsNullOrWhiteSpace(request.Email) || !request.Email.Contains('@'))
                return "A valid email address is required.";
            if (string.IsNullOrWhiteSpace(request.Password))
                return "Password is required.";
            return null;
        }

        public bool VerifyPassword(string password, string hash)
        {
            try { return BCrypt.Net.BCrypt.Verify(password, hash); }
            catch { return false; }
        }

        private async Task<(string SchoolYear, string Semester)> GetCurrentSettingsAsync()
        {
            using var conn = new SqlConnection(_connectionString);
            var rows = await conn.QueryAsync<(string Key, string Val)>(
                "SELECT SettingKey, SettingValue FROM SystemSettings WHERE SettingKey IN ('SchoolYear','Semester')");
            var dict = rows.ToDictionary(r => r.Key, r => r.Val);
            return (
                dict.TryGetValue("SchoolYear", out var sy) ? sy : "2026-2027",
                dict.TryGetValue("Semester",   out var sm) ? sm : "1st Semester"
            );
        }

        // Every read path in this system (Attendance Logs, logsheets, the
        // various *Overview/*Detail stored procedures) reads the plain
        // MentorProfiles/MenteeProfiles.Department TEXT column directly —
        // DepartmentID is only ever used to drive the dropdown and to look
        // this name up. ProfileService's update path already resolves and
        // saves both together; a brand-new registration (Add User form or
        // CSV Import) must do the same or the new account shows "No
        // department info" everywhere until someone happens to re-save it
        // via Edit User.
        // A department with no school (e.g. SAS) means the mentor has no school.
        private async Task<string?> ResolveMentorSchoolAsync(int? departmentId, string? school)
        {
            if (!departmentId.HasValue) return school;
            using var conn = new SqlConnection(_connectionString);
            var dept = await conn.QueryFirstOrDefaultAsync<(string? DepartmentName, string? School)>(
                "SELECT DepartmentName, School FROM Departments WHERE DepartmentID = @Id",
                new { Id = departmentId });
            return dept.DepartmentName != null && string.IsNullOrWhiteSpace(dept.School) ? null : school;
        }

        private async Task<string?> ResolveDepartmentNameAsync(int? departmentId)
        {
            if (!departmentId.HasValue) return null;
            using var conn = new SqlConnection(_connectionString);
            return await conn.QueryFirstOrDefaultAsync<string>(
                "SELECT DepartmentName FROM Departments WHERE DepartmentID = @Id",
                new { Id = departmentId });
        }

        public User? GetUserByEmail(string email)
            => _userRepo.GetAll().FirstOrDefault(u => u.Email.ToLower() == email.ToLower());

        public async Task<int> GetUserCountAsync()
        {
            using var conn = new SqlConnection(_connectionString);
            return await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM Users");
        }

        public async Task<bool> RegisterAsync(User user)
        {
            await _userRepo.Create(user);
            return true;
        }

        // ── Login ───────────────────────────────────────────────────────────
        public async Task<LoginResponse?> LoginAsync(LoginRequest request)
        {
            var (user, deactivated) = await AuthenticateAsync(request);
            if (user == null) return null;
            if (deactivated) return new LoginResponse { IsDeactivated = true };
            return await BuildLoginResponseAsync(user, request.RememberMe);
        }

        public async Task MarkEmailVerifiedAsync(int userId)
        {
            using var conn = new SqlConnection(_connectionString);
            await conn.ExecuteAsync(
                "UPDATE Users SET EmailVerifiedAt = @Now WHERE UserID = @Id AND EmailVerifiedAt IS NULL",
                new { Id = userId, Now = DateTime.Now });
        }

        public User? GetUserById(int userId)
            => _userRepo.GetAll().FirstOrDefault(u => u.UserID == userId);

        // Password check only — no token. Login is two-step (see
        // AuthController): this proves the password, then an emailed code
        // must be verified before BuildLoginResponseAsync issues the JWT.
        public async Task<(User? User, bool IsDeactivated)> AuthenticateAsync(LoginRequest request)
        {
            var user = GetUserByEmail(request.Email);
            if (user == null) return (null, false);

            bool passwordValid = false;
            try
            {
                passwordValid = BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash);
            }
            catch (Exception)
            {
                using var sha256 = System.Security.Cryptography.SHA256.Create();
                var bytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(request.Password));
                var sha256Hash = Convert.ToBase64String(bytes);
                passwordValid = sha256Hash == user.PasswordHash;

                if (passwordValid)
                {
                    user.PasswordHash = HashPassword(request.Password);
                    user.UpdatedAt = DateTime.Now;
                    await _userRepo.UpdateAsync(user);
                }
            }

            if (!passwordValid) return (null, false);

            // Correct password, but the account has been deactivated (User
            // Management's Activate/Deactivate control) — block the login
            // instead of issuing a token. Returned as a distinct result so the
            // controller can tell the user why, rather than "wrong password".
            if (!user.IsActive) return (user, true);

            return (user, false);
        }

        public async Task<LoginResponse> BuildLoginResponseAsync(User user, bool rememberMe)
        {
            bool setupRequired = false;
            if (user.Role.Equals("Mentor", StringComparison.OrdinalIgnoreCase) ||
                user.Role.Equals("Mentee", StringComparison.OrdinalIgnoreCase) ||
                user.Role.Equals("Admin", StringComparison.OrdinalIgnoreCase) ||
                user.Role.Equals("Head", StringComparison.OrdinalIgnoreCase))
            {
                using var sigConn = new SqlConnection(_connectionString);
                // Admin/Head have no dedicated profile table — their
                // signature lives directly on Users.
                var table = user.Role.Equals("Mentor", StringComparison.OrdinalIgnoreCase)
                    ? "MentorProfiles"
                    : user.Role.Equals("Mentee", StringComparison.OrdinalIgnoreCase)
                        ? "MenteeProfiles"
                        : "Users";
                var sig = await sigConn.ExecuteScalarAsync<string?>(
                    $"SELECT SignatureFilePath FROM {table} WHERE UserID = @UserID",
                    new { UserID = user.UserID });
                setupRequired = string.IsNullOrEmpty(sig);
            }

            return new LoginResponse
            {
                Token = GenerateToken(user, rememberMe),
                Role = user.Role,
                User = new
                {
                    user.UserID,
                    user.FirstName,
                    user.LastName,
                    user.Email,
                    user.Role,
                    setupRequired
                }
            };
        }

        // ── Register Mentee ─────────────────────────────────────────────────
        public async Task<MenteeRegistrationResult> RegisterMenteeAsync(UserRegisterRequest request)
        {
            var validationError = ValidateRegistration(request);
            if (validationError != null)
                return new MenteeRegistrationResult { Success = false, Message = validationError };
            if (GetUserByEmail(request.Email) != null)
                return new MenteeRegistrationResult { Success = false, Message = "Email already exists" };

            using (var courseConn = new SqlConnection(_connectionString))
            {
                var course=await CoursePolicy.ResolveAsync(courseConn,request.School,request.Course);
                if(course==null)return new MenteeRegistrationResult {Success=false,Message=CoursePolicy.Error};
                request.School=course.School;request.Course=course.CourseCode;
                request.SectionID=await CoursePolicy.SectionIdAsync(courseConn,course);
            }

            var (schoolYear, semester) = await GetCurrentSettingsAsync();

            var user = new User
            {
                FirstName = request.FirstName,
                LastName = request.LastName,
                Email = request.Email,
                PasswordHash = HashPassword(request.Password),
                Role = "Mentee",
                ContactNumber = request.ContactNumber,
                StudentNumber = request.StudentNumber,
                IsActive = true,
                CreatedAt = DateTime.Now,
                UpdatedAt = DateTime.Now,
                SchoolYear = schoolYear,
                Semester   = semester,
                Gender     = request.Gender
            };

            await _userRepo.Create(user);

            var menteeProfile = new MenteeProfile
            {
                UserID       = user.UserID,
                Course       = request.Course,
                YearLevel    = request.YearLevel,
                Section      = request.Section,
                School       = request.School,
                DepartmentID = request.DepartmentID,
                Department   = await ResolveDepartmentNameAsync(request.DepartmentID),
                SectionID    = request.SectionID
            };

            await _menteeRepo.Create(menteeProfile);

            return new MenteeRegistrationResult
            {
                Success = true,
                Message = "Mentee registered successfully. Please assign a mentor.",
                UserId = user.UserID,
                MenteeProfileId = menteeProfile.MenteeProfileID,
                IsAssigned = false
            };
        }

        // ── Register Mentor ─────────────────────────────────────────────────
        public async Task<MentorRegistrationResult> RegisterMentorAsync(UserRegisterRequest request)
        {
            var validationError = ValidateRegistration(request);
            if (validationError != null)
                return new MentorRegistrationResult { Success = false, Message = validationError };
            if (GetUserByEmail(request.Email) != null)
                return new MentorRegistrationResult { Success = false, Message = "Email already exists" };

            var (schoolYear, semester) = await GetCurrentSettingsAsync();

            var user = new User
            {
                FirstName = request.FirstName,
                LastName = request.LastName,
                Email = request.Email,
                PasswordHash = HashPassword(request.Password),
                Role = "Mentor",
                ContactNumber = request.ContactNumber,
                StudentNumber = request.StudentNumber,
                IsActive = true,
                CreatedAt = DateTime.Now,
                UpdatedAt = DateTime.Now,
                SchoolYear = schoolYear,
                Semester   = semester,
                Gender     = request.Gender
            };

            await _userRepo.Create(user);

            var mentorProfile = new MentorProfile
            {
                UserID = user.UserID,
                School = await ResolveMentorSchoolAsync(request.DepartmentID, request.School),
                DepartmentID = request.DepartmentID,
                Department = await ResolveDepartmentNameAsync(request.DepartmentID),
                Bio = request.Bio,
                Expertise = request.Expertise
            };

            await _mentorRepo.Create(mentorProfile);

            return new MentorRegistrationResult
            {
                Success = true,
                Message = "Mentor registered successfully",
                UserId = user.UserID,
                MentorProfileId = mentorProfile.MentorProfileID
            };
        }

        // ── Generate JWT Token ──────────────────────────────────────────────
        private string GenerateToken(User user, bool rememberMe = false)
        {
            // No hardcoded fallback here on purpose — Program.cs already refuses to
            // start outside Development if Jwt:Key is missing or still the
            // dev-default value, so by the time this ever runs, config is
            // guaranteed sane. Falling back independently here would let this one
            // spot silently reintroduce the same weak-key vulnerability even if
            // Program.cs's guard is ever changed or bypassed.
            var jwtKey = _config["Jwt:Key"];
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var claims = new[]
            {
                new Claim(ClaimTypes.NameIdentifier, user.UserID.ToString()),
                new Claim(ClaimTypes.Email,          user.Email),
                new Claim(ClaimTypes.Role,           user.Role),
                new Claim("FirstName",               user.FirstName),
                new Claim("LastName",                user.LastName),
            };

            // "Remember me" unchecked (default): 8h, roughly a school day —
            // checked: 30 days, so someone who opts in stays signed in
            // across days without re-entering their password each time.
            var expires = rememberMe
                ? DateTime.UtcNow.AddDays(30)
                : DateTime.UtcNow.AddHours(8);

            var token = new JwtSecurityToken(
                issuer: _config["Jwt:Issuer"] ?? "AstraMentoringAPI",
                audience: _config["Jwt:Audience"] ?? "AstraMentoringClient",
                claims: claims,
                expires: expires,
                signingCredentials: creds
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }

  
    public class UserRegisterRequest
    {
        public string FirstName { get; set; } = string.Empty;
        public string LastName { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
        public string Role { get; set; } = string.Empty;
        public string? ContactNumber { get; set; }
        public string? Gender { get; set; }
        public string? StudentNumber { get; set; }

        // Mentee fields
        public string? Course { get; set; }
        public string? YearLevel { get; set; }
        public string? Section { get; set; }
        public string? School { get; set; }
        public int? DepartmentID { get; set; }
        public int? SectionID { get; set; }
        public string? Bio { get; set; }
        public string? Expertise { get; set; }
    }

    public class LoginRequest
    {
        public string Email { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
        // Login page's "Remember me" checkbox — previously accepted but
        // never actually read, so the box did nothing regardless of
        // whether it was checked. Now controls the issued token's expiry
        // (see AuthService.GenerateToken).
        public bool RememberMe { get; set; } = false;
    }

    public class LoginResponse
    {
        public string Token { get; set; } = string.Empty;
        public string Role { get; set; } = string.Empty;
        public object User { get; set; } = null!;
        public bool IsDeactivated { get; set; } = false;
    }

    public class MenteeRegistrationResult
    {
        public bool Success { get; set; }
        public string Message { get; set; } = string.Empty;
        public int? UserId { get; set; }
        public int? MenteeProfileId { get; set; }
        public int? AssignedMentorId { get; set; }
        public bool IsAssigned { get; set; }
    }

    public class MentorRegistrationResult
    {
        public bool Success { get; set; }
        public string Message { get; set; } = string.Empty;
        public int? UserId { get; set; }
        public int? MentorProfileId { get; set; }
    }
}