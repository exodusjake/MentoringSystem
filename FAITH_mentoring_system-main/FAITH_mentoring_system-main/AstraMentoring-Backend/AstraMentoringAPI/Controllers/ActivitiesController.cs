using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AstraMentoring_Backend.Services;

namespace AstraMentoringAPI.Controllers
{
    // Unused by any portal's frontend today. Read-only, no mutation — kept
    // authenticated-only as a baseline.
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class ActivitiesController : ControllerBase
    {
        private readonly ActivitiesService _service;
        public ActivitiesController(ActivitiesService service) { _service = service; }

        [HttpGet]
        public async Task<IActionResult> Get([FromQuery] int top = 10)
        {
            var result = await _service.GetRecentActivitiesAsync(top);
            return Ok(result);
        }
    }
}
