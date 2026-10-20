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
        private readonly PasswordResetStore _resets;
        private readonly PasswordChangeStore _changes;
        private readonly MaintenanceService _maintenance;

        public AuthController(AuthService service, IConfiguration config, LoginAttemptTracker attempts, LoginCodeStore codes, EmailService email, PasswordResetStore resets, PasswordChangeStore changes, MaintenanceService maintenance)
        {
            _service = service;
            _config = config;
            _attempts = attempts;
            _codes = codes;
            _email = email;
            _resets = resets;
            _changes = changes;
            _maintenance = maintenance;
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

            var maint = await _maintenance.GetAsync();
            if (maint.Blocks(user.Role))
                return StatusCode(StatusCodes.Status503ServiceUnavailable, maint.Payload(user.Role));

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

            var maintNow = await _maintenance.GetAsync();
            if (maintNow.Blocks(user.Role))
                return StatusCode(StatusCodes.Status503ServiceUnavailable, maintNow.Payload(user.Role));

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

        public class ForgotPasswordRequest
        {
            public string Email { get; set; } = string.Empty;
        }

        public class VerifyResetCodeRequest
        {
            public string Email { get; set; } = string.Empty;
            public string Code { get; set; } = string.Empty;
        }

        public class ResetPasswordRequest
        {
            public string Email { get; set; } = string.Empty;
            public string Token { get; set; } = string.Empty;
            public string NewPassword { get; set; } = string.Empty;
        }

        // Forgot password, step 1: emails a one-time code. The reply is always
        // the same, whether or not the address belongs to an account, so this
        // can't be used to discover who is registered.
        [HttpPost("forgot-password")]
        [AllowAnonymous]
        [EnableRateLimiting("login")]
        public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest request)
        {
            const string generic = "If that email belongs to an account, a reset code has been sent to it.";
            var email = (request.Email ?? string.Empty).Trim();
            if (email.Length == 0 || email.Length > 150)
                return BadRequest(new { message = "Please enter your email address." });

            var user = _service.GetUserByEmail(email);
            if (user != null && user.IsActive)
            {
                var code = _resets.TryCreate(user.UserID);
                if (code != null)
                    await _email.SendPasswordResetCodeAsync(user.Email, user.FirstName, code, (int)PasswordResetStore.Lifetime.TotalMinutes);
            }
            return Ok(new { message = generic });
        }

        // Forgot password, step 2: checks the emailed code and hands back a short-lived token.
        [HttpPost("verify-reset-code")]
        [AllowAnonymous]
        [EnableRateLimiting("login")]
        public IActionResult VerifyResetCode([FromBody] VerifyResetCodeRequest request)
        {
            const string invalid = "That code is incorrect or has expired. Please request a new one.";
            var user = _service.GetUserByEmail((request.Email ?? string.Empty).Trim());
            if (user == null || !user.IsActive)
                return BadRequest(new { message = invalid });

            switch (_resets.VerifyForToken(user.UserID, request.Code, out var token))
            {
                case PasswordResetStore.VerifyStatus.Ok:
                    return Ok(new { token });
                case PasswordResetStore.VerifyStatus.Invalid:
                    return BadRequest(new { message = "Incorrect code. Please check your email and try again." });
                default:
                    return BadRequest(new { message = invalid, restart = true });
            }
        }

        // Forgot password, step 3: the new password is only accepted with the token from step 2.
        [HttpPost("reset-password")]
        [AllowAnonymous]
        [EnableRateLimiting("login")]
        public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest request)
        {
            var pw = request.NewPassword ?? string.Empty;
            var pwError = PasswordPolicy.Validate(pw);
            if (pwError != null) return BadRequest(new { message = pwError });

            var user = _service.GetUserByEmail((request.Email ?? string.Empty).Trim());
            if (user == null || !user.IsActive || !_resets.ConsumeToken(user.UserID, request.Token))
                return BadRequest(new { message = "Verification expired. Please request a new code.", restart = true });

            await _service.SetPasswordAsync(user.UserID, pw);
            _attempts.RecordSuccess(user.Email);
            return Ok(new { message = "Your password has been reset. You can now log in." });
        }

        private int CallerId => int.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);

        public class PasswordCodeRequest { public string CurrentPassword { get; set; } = string.Empty; }
        public class PasswordCodeVerifyRequest { public string Code { get; set; } = string.Empty; }
        public class ChangePasswordRequest
        {
            public string CurrentPassword { get; set; } = string.Empty;
            public string NewPassword { get; set; } = string.Empty;
            public string Token { get; set; } = string.Empty;
        }

        // Signed-in change password, step 1: the current password is checked and
        // a code is emailed to the account's address.
        [HttpPost("password-code")]
        [Authorize]
        [EnableRateLimiting("login")]
        public async Task<IActionResult> SendPasswordChangeCode([FromBody] PasswordCodeRequest request)
        {
            var user = _service.GetUserById(CallerId);
            if (user == null || !user.IsActive) return Unauthorized();
            if (string.IsNullOrEmpty(request.CurrentPassword) || !_service.VerifyPassword(request.CurrentPassword, user.PasswordHash))
                return BadRequest(new { message = "Current password is incorrect." });

            var code = _changes.TryCreateCode(user.UserID, out var retryAfter);
            if (code == null)
                return StatusCode(429, new { message = $"A code was just sent. You can request another in {Math.Ceiling(retryAfter.TotalSeconds)} seconds.", retryAfterSeconds = (int)Math.Ceiling(retryAfter.TotalSeconds) });

            if (!await _email.SendPasswordChangeCodeAsync(user.Email, user.FirstName, code, (int)PasswordChangeStore.CodeLifetime.TotalMinutes))
                return StatusCode(503, new { message = "We couldn't send the verification code. Please try again shortly." });

            return Ok(new { message = "Verification code sent.", email = MaskEmail(user.Email), resendAfterSeconds = (int)PasswordChangeStore.ResendCooldown.TotalSeconds });
        }

        // Step 2: the emailed code is exchanged for a short-lived token.
        [HttpPost("password-code/verify")]
        [Authorize]
        [EnableRateLimiting("login")]
        public IActionResult VerifyPasswordChangeCode([FromBody] PasswordCodeVerifyRequest request)
        {
            var status = _changes.VerifyCode(CallerId, request.Code, out var token);
            return status switch
            {
                PasswordChangeStore.VerifyStatus.Ok => Ok(new { token }),
                PasswordChangeStore.VerifyStatus.Invalid => BadRequest(new { message = "Incorrect code. Please check your email and try again." }),
                PasswordChangeStore.VerifyStatus.TooManyAttempts => BadRequest(new { message = "Too many incorrect codes. Please request a new one.", restart = true }),
                _ => BadRequest(new { message = "That code has expired. Please request a new one.", restart = true })
            };
        }

        // Step 3: the new password is only accepted with the token from step 2.
        [HttpPost("change-password")]
        [Authorize]
        [EnableRateLimiting("login")]
        public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request)
        {
            var user = _service.GetUserById(CallerId);
            if (user == null || !user.IsActive) return Unauthorized();

            var pw = request.NewPassword ?? string.Empty;
            var pwError = PasswordPolicy.Validate(pw);
            if (pwError != null) return BadRequest(new { message = pwError });
            if (!_service.VerifyPassword(request.CurrentPassword ?? string.Empty, user.PasswordHash))
                return BadRequest(new { message = "Current password is incorrect." });
            if (!_changes.ConsumeToken(user.UserID, request.Token))
                return BadRequest(new { message = "Verification expired. Please verify your current password again.", restart = true });

            await _service.SetPasswordAsync(user.UserID, pw);
            return Ok(new { message = "Password changed." });
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
