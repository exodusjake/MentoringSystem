using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AstraMentoring_Backend.Services;

namespace AstraMentoringAPI.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class SectionsController : ControllerBase
    {
        private readonly SectionsService _service;
        public SectionsController(SectionsService service) { _service = service; }

        [HttpGet]
        public async Task<IActionResult> Get([FromQuery] string? school)
        {
            if (!string.IsNullOrWhiteSpace(school))
                return Ok(await _service.GetBySchoolAsync(school));
            return Ok(await _service.GetAllAsync());
        }

        [HttpGet("mentor-view")]
        public async Task<IActionResult> GetMentorView()
            => Ok(await _service.GetMentorViewAsync());

        // Admin-only, not Head — creating/deleting sections is an
        // operational action, and Head has no UI for it at all.
        [HttpPost]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> Create([FromBody] CreateSectionRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.Course) ||
                string.IsNullOrWhiteSpace(req.School))
                return BadRequest(new { message = "All fields are required." });

            var newId = await _service.CreateAsync(req);
            return newId.HasValue
                ? Ok(new { message = "Section created", sectionID = newId.Value })
                : Conflict(new { message = "This section already exists." });
        }

        [HttpDelete("{id}")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> Delete(int id)
        {
            var menteeCount = await _service.CountMenteesInSectionAsync(id);
            if (menteeCount > 0)
            {
                var who = menteeCount == 1 ? "1 mentee is" : $"{menteeCount} mentees are";
                return Conflict(new { message = $"Cannot delete — {who} still assigned to this section. Reassign or edit them to a different section first." });
            }

            var result = await _service.DeleteAsync(id);
            return result ? Ok(new { message = "Section deleted" }) : NotFound();
        }
    }
}
