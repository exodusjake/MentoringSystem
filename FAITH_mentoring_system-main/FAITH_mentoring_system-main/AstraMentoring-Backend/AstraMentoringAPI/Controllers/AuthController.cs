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

        public AuthController(AuthService service, IConfiguration config, LoginAttemptTracker attempts)
        {
            _service = service;
            _config = config;
            _attempts = attempts;
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

        [HttpPost("login")]
        [AllowAnonymous]
        [EnableRateLimiting("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest request)
        {
            if (_attempts.IsLocked(request.Email))
                return StatusCode(StatusCodes.Status429TooManyRequests, new { message = "Too many login attempts. Please wait 1 minute before trying again." });

            var result = await _service.LoginAsync(request);
            if (result == null)
            {
                _attempts.RecordFailure(request.Email);
                return Unauthorized(new { message = "Invalid email or password" });
            }
            _attempts.RecordSuccess(request.Email);

            if (result.IsDeactivated)
                return StatusCode(403, new { message = "This account has been deactivated. Please contact the Guidance Office." });

            return Ok(new
            {
                token = result.Token,
                role = result.Role,
                user = result.User
            });
        }
    }
}