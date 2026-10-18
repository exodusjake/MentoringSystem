using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Services;

namespace AstraMentoringAPI.Controllers
{
    // This table is keyed by the generic Users.UserID (not a mentor-specific
    // ID), which is why it doubles as the personal planner for Mentor, Head
    // Admin and Admin alike. That also means, without an ownership check,
    // any authenticated user could read or write ANY other user's personal
    // calendar just by passing a different id — every action here confirms
    // the caller is only ever touching their own events.
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class MentorScheduleController : ControllerBase
    {
        private readonly MentorScheduleService _service;
        public MentorScheduleController(MentorScheduleService service) { _service = service; }

        private int CallerId => int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        [HttpGet]
        public async Task<IActionResult> Get([FromQuery] int mentorId)
        {
            if (mentorId <= 0) return BadRequest(new { message = "mentorId is required" });
            if (mentorId != CallerId) return Forbid();
            return Ok(await _service.GetByMentor(mentorId));
        }

        [HttpPost]
        public async Task<IActionResult> Post([FromBody] MentorPersonalEvent data)
        {
            data.MentorID  = CallerId; // ignore whatever the client sent — always the caller's own
            data.CreatedAt = DateTime.Now;
            var result = await _service.Add(data);
            return result ? Ok(new { message = "Event created", eventId = data.EventID }) : BadRequest();
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> Put(int id, [FromBody] MentorPersonalEvent data)
        {
            var existing = await _service.GetById(id);
            if (existing is null) return NotFound();
            if (existing.MentorID != CallerId) return Forbid();

            data.EventID  = id;
            data.MentorID = CallerId;
            var result = await _service.Update(data);
            return result ? Ok(new { message = "Event updated" }) : NotFound();
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            var existing = await _service.GetById(id);
            if (existing is null) return NotFound();
            if (existing.MentorID != CallerId) return Forbid();

            var result = await _service.Delete(id);
            return result ? Ok(new { message = "Event deleted" }) : NotFound();
        }
    }
}
