using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AstraMentoringAPI.Controllers
{
    // Public status of the maintenance switches — the maintenance screen polls this to know when to reopen.
    [Route("api/[controller]")]
    [ApiController]
    public class MaintenanceController : ControllerBase
    {
        private readonly MaintenanceService _maintenance;
        public MaintenanceController(MaintenanceService maintenance) => _maintenance = maintenance;

        [HttpGet]
        [AllowAnonymous]
        public async Task<IActionResult> Get()
        {
            var m = await _maintenance.GetAsync();
            return Ok(new { mentor = m.Mentor, mentee = m.Mentee, eta = m.Eta, message = m.Message });
        }
    }
}
