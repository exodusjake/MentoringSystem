using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Services;

namespace AstraMentoringAPI.Controllers
{
    // Superseded by AvailabilityWorkflowController (mentor/{id}/slots) for
    // every live flow — no portal's frontend calls this bare controller.
    // Restricted to staff/mentor roles as a safe baseline.
    [Route("api/[controller]")]
    [ApiController]
    [Authorize(Roles = "Mentor,Admin,Head")]
    public class AvailabilityController : ControllerBase
    {
        private readonly AvailabilityService _service;
        public AvailabilityController(AvailabilityService service) { _service = service; }

        [HttpGet]
        public async Task<IActionResult> Get() => Ok(await _service.GetAll());

        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(int id)
        {
            var result = await _service.GetById(id);
            return result is null ? NotFound() : Ok(result);
        }

        [HttpPost]
        public async Task<IActionResult> Post([FromBody] Availability data)
        {
            return BadRequest(new { message = "Use the Availability workflow to manage slots." });
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> Put(int id, [FromBody] Availability data)
        {
            data.AvailabilityID = id;
            return BadRequest(new { message = "Use the Availability workflow to manage slots." });
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            return BadRequest(new { message = "Use the Availability workflow to manage slots." });
        }
    }
}