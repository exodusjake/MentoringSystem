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
        public SettingsController(SettingsService service) { _service = service; }

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

        [HttpPut("change-password")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> ChangePassword([FromBody] ChangeSettingsPasswordRequest request)
        {
            var ok = await _service.VerifySettingsPasswordAsync(request.CurrentPassword);
            if (!ok) return BadRequest(new { message = "Incorrect current password." });
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
    }
}
