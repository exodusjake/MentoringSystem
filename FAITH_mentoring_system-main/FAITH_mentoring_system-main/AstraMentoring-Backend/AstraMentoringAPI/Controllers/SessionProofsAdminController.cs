using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AstraMentoring_Backend.Services;

namespace AstraMentoringAPI.Controllers
{
    // Full oversight dump of proof-of-session records across every mentor —
    // read by both Admin's and Head's Proof Tracking pages. Read-only route
    // (no mutating action anywhere on this controller), so Head gets the
    // same GET access Head already has on EvaluationRatingsController.
    [Route("api/[controller]")]
    [ApiController]
    [Authorize(Roles = "Admin,Head")]
    public class SessionProofsAdminController : ControllerBase
    {
        private readonly SessionProofsAdminService _service;
        public SessionProofsAdminController(SessionProofsAdminService service) { _service = service; }

        [HttpGet]
        public async Task<IActionResult> Get() => Ok(await _service.GetAsync());
    }
}
