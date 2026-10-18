using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using AstraMentoring_Backend.Services;

namespace AstraMentoringAPI.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class EvaluationRatingsController : ControllerBase
    {
        private readonly EvaluationRatingsService _service;
        public EvaluationRatingsController(EvaluationRatingsService service) { _service = service; }

        // Head reads this (mirrors the read-only System Info card on its
        // own Account page) but never writes it — only Admin can.
        [HttpGet("{mentorId}")]
        [Authorize(Roles = "Admin,Head")]
        public async Task<IActionResult> Get(int mentorId, [FromQuery] string schoolYear, [FromQuery] string semester)
        {
            if (string.IsNullOrWhiteSpace(schoolYear) || string.IsNullOrWhiteSpace(semester))
                return BadRequest(new { message = "schoolYear and semester are required." });

            var rating = await _service.GetAsync(mentorId, schoolYear, semester);
            return Ok(new { ratingPct = rating });
        }

        [HttpPut("{mentorId}")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> Upsert(int mentorId, [FromBody] EvaluationRatingUpsertDto data)
        {
            if (string.IsNullOrWhiteSpace(data.SchoolYear) || string.IsNullOrWhiteSpace(data.Semester))
                return BadRequest(new { message = "schoolYear and semester are required." });
            if (data.RatingPct < 0 || data.RatingPct > 100)
                return BadRequest(new { message = "Rating must be between 0 and 100." });

            var adminId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
            await _service.UpsertAsync(mentorId, data.SchoolYear, data.Semester, data.RatingPct, adminId);
            return Ok(new { message = "Evaluation rating saved." });
        }

        // Clears a mentor's rating back to "Not Yet Rated" for a period —
        // the Evaluation Ratings table's rating input can't be saved blank
        // (a fresh, never-rated mentor must stay that way until Admin
        // deliberately types something), but once a rating IS on record,
        // Admin needs a real way to undo it, not just silently discard the
        // edit like every other blank keystroke.
        [HttpDelete("{mentorId}")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> Delete(int mentorId, [FromQuery] string schoolYear, [FromQuery] string semester)
        {
            if (string.IsNullOrWhiteSpace(schoolYear) || string.IsNullOrWhiteSpace(semester))
                return BadRequest(new { message = "schoolYear and semester are required." });

            await _service.DeleteAsync(mentorId, schoolYear, semester);
            return Ok(new { message = "Evaluation rating cleared." });
        }
    }

    public record EvaluationRatingUpsertDto(string SchoolYear, string Semester, decimal RatingPct);
}
