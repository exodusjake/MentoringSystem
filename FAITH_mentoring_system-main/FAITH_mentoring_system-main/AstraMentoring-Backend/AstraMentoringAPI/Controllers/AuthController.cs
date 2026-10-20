using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Services;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using static AstraMentoring_Backend.Services.AuthService;

namespace AstraMentoringAPI.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AuthController : ControllerBase
    {
        private readonly AuthService _service;
        private readonly IConfiguration _config;
        private readonly LoginAttemptTracker _attempts;
        private readonly LoginCodeStore _codes;
        private readonly EmailService _email;

        public AuthController(AuthService service, IConfiguration config, LoginAttemptTracker attempts, LoginCodeStore codes, EmailService email)
        {
            _service = service;
            _config = config;
            _attempts = attempts;
            _codes = codes;
            _email = email;
        }

        // Creates a user with an ARBITRARY role (including Admin/Head) from the
        // request body — this is Admin's User Management "add user" tool, not a
        // public signup form. Admin-only: Head has no account-creation UI.
        [HttpPost("register")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> Register([FromBody] UserRegisterRequest request)
        {
            var validationError = AuthService.ValidateRegistration(request);
            if (validationError != null)
                return BadRequest(new { message = validationError });

            var existing = _service.GetUserByEmail(request.Email);
            if (existing != null)
                return BadRequest(new { message = "A user with this email already exists." });

            using var conn = new Microsoft.Data.SqlClient.SqlConnection(
                _config.GetConnectionString("DefaultConnection")
                ?? "Server=(localdb)\\MSSQLLocalDB;Database=AstraMentoring;Trusted_Connection=True;MultipleActiveResultSets=True");
            var rows = await conn.QueryAsync<(string Key, string Val)>(
                "SELECT SettingKey, SettingValue FROM SystemSettings WHERE SettingKey IN ('SchoolYear','Semester')");
            var dict = rows.ToDictionary(r => r.Key, r => r.Val);
            var schoolYear = dict.TryGetValue("SchoolYear", out var sy) ? sy : "2026-2027";
            var semester   = dict.TryGetValue("Semester",   out var sm) ? sm : "1st Semester";

            var user = new User
            {
                FirstName = request.FirstName,
                LastName = request.LastName,
                Email = request.Email,
                PasswordHash = _service.HashPassword(request.Password),
                Role = request.Role,
                ContactNumber = request.ContactNumber,
                StudentNumber = request.StudentNumber,
                Gender = request.Gender,
                IsActive = true,
                CreatedAt = DateTime.Now,
                UpdatedAt = DateTime.Now,
                SchoolYear = schoolYear,
                Semester   = semester
            };

            await _service.RegisterAsync(user);
            return Ok(new { message = "User registered successfully" });
        }

        // Only ever called from Admin's User Management page (single-add and
        // CSV bulk-import) — there is no public signup form anywhere in the app.
        [HttpPost("register-mentee")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> RegisterMentee([FromBody] UserRegisterRequest request)
        {
            var result = await _service.RegisterMenteeAsync(request);
            if (!result.Success)
                return BadRequest(new { message = result.Message });

            return Ok(new
            {
                message = result.Message,
                userId = result.UserId,
                menteeProfileId = result.MenteeProfileId,
                isAssigned = result.IsAssigned
            });
        }

        // Same as register-mentee — Admin-only tool, not public signup.
        [HttpPost("register-mentor")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> RegisterMentor([FromBody] UserRegisterRequest request)
        {
            var result = await _service.RegisterMentorAsync(request);
            if (!result.Success)
                return BadRequest(new { message = result.Message });

            return Ok(new
            {
                message = result.Message,
                userId = result.UserId,
                mentorProfileId = result.MentorProfileId
            });
        }

        // Step 1 of 2: verifies the password, then emails a one-time code.
        // No token is issued here (unless Auth:RequireEmailCode is turned
        // off) — the client must follow up with Auth/verify-login-code.
        [HttpPost("login")]
        [AllowAnonymous]
        [EnableRateLimiting("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest request)
        {
            if (_attempts.IsLocked(request.Email))
                return StatusCode(StatusCodes.Status429TooManyRequests, new { message = "Too many login attempts. Please wait 1 minute before trying again." });

            var (user, isDeactivated) = await _service.AuthenticateAsync(request);
            if (user == null)
            {
                _attempts.RecordFailure(request.Email);
                return Unauthorized(new { message = "Invalid email or password" });
            }
            _attempts.RecordSuccess(request.Email);

            if (isDeactivated)
                return StatusCode(403, new { message = "This account has been deactivated. Please contact the Guidance Office." });

            // The code is only needed once, to confirm the email an Admin registered;
            // after that first verification the password alone is enough.
            if (!_config.GetValue("Auth:RequireEmailCode", true) || user.EmailVerifiedAt != null)
                return Ok(ToLoginPayload(await _service.BuildLoginResponseAsync(user, request.RememberMe)));

            var (challengeId, code) = _codes.Create(user.UserID, request.RememberMe);
            if (!await _email.SendLoginCodeAsync(user.Email, user.FirstName, code, (int)LoginCodeStore.Lifetime.TotalMinutes))
                return StatusCode(503, new { message = "We couldn't send your verification code. Please try again shortly or contact the Guidance Office." });

            return Ok(new { requiresCode = true, challengeId, email = MaskEmail(user.Email) });
        }

        public class VerifyLoginCodeRequest
        {
            public string ChallengeId { get; set; } = string.Empty;
            public string Code { get; set; } = string.Empty;
        }

        // Step 2 of 2: exchanges the emailed code for the session token.
        [HttpPost("verify-login-code")]
        [AllowAnonymous]
        [EnableRateLimiting("login")]
        public async Task<IActionResult> VerifyLoginCode([FromBody] VerifyLoginCodeRequest request)
        {
            var status = _codes.Verify(request.ChallengeId, request.Code, out var verified);
            switch (status)
            {
                case LoginCodeStore.VerifyStatus.Expired:
                    return BadRequest(new { message = "This code has expired. Please log in again.", restart = true });
                case LoginCodeStore.VerifyStatus.TooManyAttempts:
                    return BadRequest(new { message = "Too many incorrect codes. Please log in again.", restart = true });
                case LoginCodeStore.VerifyStatus.Invalid:
                    return BadRequest(new { message = "Incorrect code. Please check your email and try again." });
            }

            var user = _service.GetUserById(verified!.UserId);
            if (user == null || !user.IsActive)
                return StatusCode(403, new { message = "This account has been deactivated. Please contact the Guidance Office." });

            await _service.MarkEmailVerifiedAsync(user.UserID);
            return Ok(ToLoginPayload(await _service.BuildLoginResponseAsync(user, verified.RememberMe)));
        }

        [HttpPost("resend-login-code")]
        [AllowAnonymous]
        [EnableRateLimiting("login")]
        public async Task<IActionResult> ResendLoginCode([FromBody] VerifyLoginCodeRequest request)
        {
            var (code, userId, retryAfter) = _codes.Resend(request.ChallengeId);
            if (userId == null)
                return BadRequest(new { message = "This code has expired. Please log in again.", restart = true });
            if (code == null)
                return StatusCode(429, new { message = $"Please wait {Math.Ceiling(retryAfter!.Value.TotalSeconds)} seconds before requesting another code." });

            var user = _service.GetUserById(userId.Value);
            if (user == null || !user.IsActive || !await _email.SendLoginCodeAsync(user.Email, user.FirstName, code, (int)LoginCodeStore.Lifetime.TotalMinutes))
                return StatusCode(503, new { message = "We couldn't send your verification code. Please try again shortly." });

            return Ok(new { message = "A new code has been sent." });
        }

        private static object ToLoginPayload(LoginResponse r) => new { token = r.Token, role = r.Role, user = r.User };

        private static string MaskEmail(string email)
        {
            var at = email.IndexOf('@');
            if (at <= 1) return email;
            return email[0] + new string('*', Math.Min(at - 1, 6)) + email[at..];
        }
    }
}
