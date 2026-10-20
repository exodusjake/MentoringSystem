using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AstraMentoring_Backend.Services;

namespace AstraMentoringAPI.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class SettingsController : ControllerBase
    {
        private readonly SettingsService _service;
        private readonly AuthService _auth;
        private readonly EmailService _email;
        private readonly PasswordChangeStore _changes;
        private readonly MaintenanceService _maintenance;
        public SettingsController(SettingsService service, AuthService auth, EmailService email, PasswordChangeStore changes, MaintenanceService maintenance)
        { _service = service; _auth = auth; _email = email; _changes = changes; _maintenance = maintenance; }

        private int CallerId => int.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);
        // Settings-password codes live under a separate key from the account-password flow.
        private int FlowKey => -CallerId;

        // Open to any authenticated user — every portal's "Current Academic
        // Period" banner reads from here (HEAD, Mentor, Mentee all display
        // it read-only).
        [HttpGet]
        public async Task<IActionResult> Get()
        {
            var result = await _service.GetAllAsync();
            result.Remove(SettingsPasswordKey);
            return Ok(result);
        }

        private const string SettingsPasswordKey = "SettingsPassword";

        // The only keys Admin's System Settings page saves. SettingsPassword
        // changes only through change-password below.
        private static readonly HashSet<string> EditableKeys = new(StringComparer.Ordinal)
        {
            "SchoolYear", "Semester", "GuidanceOfficer",
            "calPreparedByName", "calPreparedByTitle", "calPreparedByEmail",
            "calApprovedByName", "calApprovedByTitle", "calApprovedByEmail",
        };

        // Admin-only: the frontend itself shows these fields as read-only
        // ("Managed by Admin") on every other portal's profile page, so the
        // API needs to actually enforce that, not just hide the edit UI.
        // Admin-only: switch the Mentor and/or Mentee portal into maintenance, with an estimated time and a message.
        [HttpPut("maintenance")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> UpdateMaintenance([FromBody] MaintenanceUpdateRequest request)
        {
            var message = (request.Message ?? string.Empty).Trim();
            if (message.Length > 250)
                return BadRequest(new { message = "The message can be at most 250 characters." });

            string eta = string.Empty;
            if (!string.IsNullOrWhiteSpace(request.Eta))
            {
                if (!DateTimeOffset.TryParse(request.Eta, System.Globalization.CultureInfo.InvariantCulture,
                        System.Globalization.DateTimeStyles.AssumeUniversal, out var parsed))
                    return BadRequest(new { message = "The estimated time isn't a valid date and time." });
                if ((request.Mentor || request.Mentee) && parsed < DateTimeOffset.UtcNow.AddMinutes(-1))
                    return BadRequest(new { message = "The estimated time must be in the future." });
                eta = parsed.UtcDateTime.ToString("o");
            }

            await _service.UpdateAsync(MaintenanceService.KeyMentor, request.Mentor ? "1" : "0");
            await _service.UpdateAsync(MaintenanceService.KeyMentee, request.Mentee ? "1" : "0");
            await _service.UpdateAsync(MaintenanceService.KeyEta, eta);
            await _service.UpdateAsync(MaintenanceService.KeyMessage, message);
            _maintenance.Invalidate();
            return Ok(new { mentor = request.Mentor, mentee = request.Mentee, eta, message });
        }

        [HttpPut("{key}")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> Update(string key, [FromBody] UpdateSettingRequest request)
        {
            if (!EditableKeys.Contains(key))
                return BadRequest(new { message = "This setting can't be changed here." });
            var result = await _service.UpdateAsync(key, request.Value);
            return result ? Ok(new { message = "Setting updated" }) : NotFound();
        }

        // Admin/Head only — backs User Management's School Year/Semester
        // filter ("who had an account during period X"). Not useful to any
        // other role, and not something a Mentor/Mentee should be able to
        // enumerate (it's effectively a roster snapshot per period).
        [HttpGet("period-history")]
        [Authorize(Roles = "Admin,Head")]
        public async Task<IActionResult> GetPeriodHistory()
        {
            var result = await _service.GetAccountPeriodHistoryAsync();
            return Ok(result);
        }

        // Admin/Head/Mentor — the Calendar Sheet print feature exists on all
        // three portals (Head's and Mentor's are read-only, managed only
        // from Admin's Settings page). Resolves whatever the Admin already
        // typed into calPreparedByEmail/calApprovedByEmail — never accepts a
        // caller-supplied email/ID — so it can't be used as a general
        // "look up anyone's signature" lookup.
        [HttpGet("calendar-signatures")]
        [Authorize(Roles = "Admin,Head,Mentor")]
        public async Task<IActionResult> GetCalendarSignatures()
        {
            var result = await _service.GetCalendarSignaturesAsync();
            return Ok(result);
        }

        [HttpPost("verify-password")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> VerifyPassword([FromBody] SettingsPasswordRequest request)
        {
            var ok = await _service.VerifySettingsPasswordAsync(request.Password);
            return ok ? Ok() : BadRequest(new { message = "Incorrect settings password." });
        }

        // Change the Settings password, step 1: the current Settings password is checked and a code is emailed.
        [HttpPost("password-code")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> SendPasswordCode([FromBody] SettingsPasswordRequest request)
        {
            var user = _auth.GetUserById(CallerId);
            if (user == null || !user.IsActive) return Unauthorized();
            if (!await _service.VerifySettingsPasswordAsync(request.Password ?? string.Empty))
                return BadRequest(new { message = "Incorrect current password." });

            var code = _changes.TryCreateCode(FlowKey, out var retryAfter);
            if (code == null)
                return StatusCode(429, new { message = $"A code was just sent. You can request another in {Math.Ceiling(retryAfter.TotalSeconds)} seconds." });

            if (!await _email.SendSettingsPasswordCodeAsync(user.Email, user.FirstName, code, (int)PasswordChangeStore.CodeLifetime.TotalMinutes))
                return StatusCode(503, new { message = "We couldn't send the verification code. Please try again shortly." });

            var at = user.Email.IndexOf('@');
            var masked = at <= 1 ? user.Email : user.Email[0] + new string('*', Math.Min(at - 1, 6)) + user.Email[at..];
            return Ok(new { message = "Verification code sent.", email = masked, resendAfterSeconds = (int)PasswordChangeStore.ResendCooldown.TotalSeconds });
        }

        // Step 2: the emailed code is exchanged for a short-lived token.
        [HttpPost("password-code/verify")]
        [Authorize(Roles = "Admin")]
        public IActionResult VerifyPasswordCode([FromBody] SettingsCodeRequest request)
        {
            var status = _changes.VerifyCode(FlowKey, request.Code, out var token);
            return status switch
            {
                PasswordChangeStore.VerifyStatus.Ok => Ok(new { token }),
                PasswordChangeStore.VerifyStatus.Invalid => BadRequest(new { message = "Incorrect code. Please check your email and try again." }),
                PasswordChangeStore.VerifyStatus.TooManyAttempts => BadRequest(new { message = "Too many incorrect codes. Please request a new one.", restart = true }),
                _ => BadRequest(new { message = "That code has expired. Please request a new one.", restart = true })
            };
        }

        [HttpPut("change-password")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> ChangePassword([FromBody] ChangeSettingsPasswordRequest request)
        {
            var ok = await _service.VerifySettingsPasswordAsync(request.CurrentPassword);
            if (!ok) return BadRequest(new { message = "Incorrect current password." });
            if (!_changes.ConsumeToken(FlowKey, request.Token))
                return BadRequest(new { message = "Verification expired. Please verify the current password again.", restart = true });
            if (string.IsNullOrWhiteSpace(request.NewPassword) || request.NewPassword.Length < 6)
                return BadRequest(new { message = "New password must be at least 6 characters." });
            await _service.UpdateSettingsPasswordAsync(request.NewPassword);
            return Ok(new { message = "Settings password changed." });
        }
    }

    public class UpdateSettingRequest        { public string Value           { get; set; } = string.Empty; }
    public class SettingsPasswordRequest     { public string Password        { get; set; } = string.Empty; }
    public class ChangeSettingsPasswordRequest
    {
        public string CurrentPassword { get; set; } = string.Empty;
        public string NewPassword     { get; set; } = string.Empty;
        public string Token           { get; set; } = string.Empty;
    }
    public class MaintenanceUpdateRequest
    {
        public bool Mentor { get; set; }
        public bool Mentee { get; set; }
        public string? Eta { get; set; }
        public string? Message { get; set; }
    }
    public class SettingsCodeRequest         { public string Code            { get; set; } = string.Empty; }
}
