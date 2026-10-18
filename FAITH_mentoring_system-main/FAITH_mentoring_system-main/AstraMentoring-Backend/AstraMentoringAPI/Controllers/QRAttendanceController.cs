using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using AstraMentoring_Backend.Services;

namespace AstraMentoringAPI.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class QRAttendanceController : ControllerBase
    {
        private readonly QRAttendanceService _service;
        public QRAttendanceController(QRAttendanceService service) { _service = service; }

        private int CallerId => int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        // POST /api/QRAttendance/generate — mentee requests a fresh short-lived
        // token for their own attendance. MenteeId always comes from the
        // caller's own JWT, never the request body — otherwise any signed-in
        // account could generate a token that scans as a *different* mentee.
        [HttpPost("generate")]
        [Authorize(Roles = "Mentee")]
        public async Task<IActionResult> Generate([FromBody] QRGenerateRequest req)
        {
            var result=await _service.GenerateTokenAsync(req.SessionId, CallerId);
            return string.IsNullOrEmpty(result.Token) ? BadRequest(new { message=result.Message }) : Ok(result);
        }

        // POST /api/QRAttendance/scan — mentor scans a token to identify the
        // mentee. Mentor-only: this is what actually marks someone present,
        // so anyone else calling it directly would be able to self-mark
        // attendance without a mentor ever scanning them.
        [HttpPost("scan")]
        [Authorize(Roles = "Mentor")]
        public async Task<IActionResult> Scan([FromBody] QRScanRequest req)
            => Ok(await _service.ScanTokenAsync(req.Token, CallerId, req.SessionId));
    }

    public record QRGenerateRequest(int SessionId, int MenteeId);
    // SessionId is the session the scanner has open; optional so a cached older page still works.
    public record QRScanRequest(string Token, int? SessionId = null);
}
