using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Services;

namespace AstraMentoringAPI.Controllers
{
    // Superseded by AvailabilityWorkflowController for every live flow — no
    // portal's frontend calls this bare controller. Kept authenticated-only
    // as a safe baseline.
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class SessionRequestsController : ControllerBase
    {
        private readonly SessionRequestsService _service;
        public SessionRequestsController(SessionRequestsService service) { _service = service; }

        [HttpGet]
        public async Task<IActionResult> Get() => Ok(await _service.GetAll());

        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(int id)
        {
            var result = await _service.GetById(id);
            return result is null ? NotFound() : Ok(result);
        }

        // Retired routes cannot bypass the validated booking workflow.
        [HttpPost]
        public IActionResult Post([FromBody] SessionRequest data)
            => BadRequest(new { message = "Use AvailabilityWorkflow to book a session." });

        [HttpPut("{id}")]
        public IActionResult Put(int id, [FromBody] SessionRequest data)
            => BadRequest(new { message = "Direct session request changes are disabled." });

        [HttpDelete("{id}")]
        public IActionResult Delete(int id)
            => BadRequest(new { message = "Manage the linked session through the session workflow." });
    }
}
