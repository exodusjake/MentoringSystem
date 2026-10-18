using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AstraMentoring_Backend.Constants;
using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Services;
using Dapper;
using Microsoft.Data.SqlClient;

namespace AstraMentoringAPI.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class CalendarEventsController : ControllerBase
    {
        private readonly CalendarEventsService _service;
        private readonly EmailService _emailService;
        private readonly IConfiguration _config;
        public CalendarEventsController(CalendarEventsService service, EmailService emailService, IConfiguration config)
        {
            _service = service;
            _emailService = emailService;
            _config = config;
        }

        // Same fallback idiom SessionsController.Post already uses for
        // "what period is active right now" when the client doesn't send one.
        private async Task<(string SchoolYear, string Semester)> ResolveCurrentPeriodAsync()
        {
            var cs = _config.GetConnectionString("DefaultConnection")
                ?? "Server=(localdb)\\MSSQLLocalDB;Database=AstraMentoring;Trusted_Connection=True;MultipleActiveResultSets=True";
            using var conn = new SqlConnection(cs);
            var settings = await conn.QueryAsync<(string Key, string Val)>(
                "SELECT SettingKey, SettingValue FROM SystemSettings WHERE SettingKey IN ('SchoolYear','Semester')");
            var dict = settings.ToDictionary(r => r.Key, r => r.Val);
            return (
                dict.TryGetValue("SchoolYear", out var sy) ? sy : "2026-2027",
                dict.TryGetValue("Semester",   out var sm) ? sm : "1st Semester"
            );
        }

        // Four activity kinds. Session Schedule and Deadline both name one
        // of the fixed MentoringSlots and are separate entries (one Session
        // Schedule + one matching Deadline per slot, not bundled); Period
        // names one of the fixed ExamPeriods (Prelims/Midterms/Finals). All
        // three reuse the SlotName column (and its per-semester unique
        // index) as "the constrained-list value for this row" — their
        // Title is derived from it so the printed sheet reads exactly like
        // FAITH's own rubric without retyping it by hand. Evaluation alone
        // keeps a free-typed Title/date range, unrelated to any list.
        private static readonly string[] ValidTypes = { "Session Schedule", "Deadline", "Period", "Evaluation" };

        // Shared by Post/Put — resolves SchoolYear/Semester defaults and
        // validates the shape for whichever activity kind this is. Returns
        // an error message (caller should 400) or null if the event is
        // valid as normalized.
        private async Task<string?> ValidateAndNormalizeAsync(CalendarEvent data, CalendarEvent? existing)
        {
            if (!ValidTypes.Contains(data.EventType))
                return $"Event Type must be one of: {string.Join(", ", ValidTypes)}.";

            if (string.IsNullOrWhiteSpace(data.SchoolYear) || string.IsNullOrWhiteSpace(data.Semester))
            {
                var (sy, sm) = await ResolveCurrentPeriodAsync();
                data.SchoolYear ??= existing?.SchoolYear ?? sy;
                data.Semester   ??= existing?.Semester   ?? sm;
            }

            if (data.EventType == "Session Schedule" || data.EventType == "Deadline" || data.EventType == "Period")
            {
                var allowed = data.EventType == "Period" ? ExamPeriods.All : MentoringSlots.ForSemester(data.Semester);
                var fieldLabel = data.EventType == "Period" ? "Period" : "Slot";
                if (string.IsNullOrWhiteSpace(data.SlotName) || !allowed.Contains(data.SlotName))
                    return $"{fieldLabel} must be one of: {string.Join(", ", allowed)}.";

                var excludeId = existing == null ? (int?)null : data.EventID;
                if (await _service.SlotExistsAsync(data.SlotName, data.EventType, data.SchoolYear!, data.Semester!, excludeId))
                    return $"A {data.EventType} for \"{data.SlotName}\" already exists this semester.";

                data.Title = data.EventType switch
                {
                    "Deadline" => $"Last Day of Submission of Mentoring Requisite Session {data.SlotName}",
                    "Period"   => data.SlotName!,
                    _          => $"Mentoring Session {data.SlotName}",
                };
            }
            else
            {
                data.SlotName = null;
            }

            data.DeadlineDate = null; // no longer used — Deadline is its own entry now, StartDate is its date
            return null;
        }

        // GET stays open to any signed-in account — the published academic
        // calendar is read by Mentor, Head, and Mentee alike.
        [HttpGet]
        public async Task<IActionResult> Get() => Ok(await _service.GetAll());

        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(int id)
        {
            var result = await _service.GetById(id);
            return result is null ? NotFound() : Ok(result);
        }

        // Only Admin's own Calendar Events page ever creates/edits/deletes —
        // everyone else's calendar view is read-only.
        [HttpPost]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> Post([FromBody] CalendarEvent data)
        {
            data.CreatedAt = DateTime.Now;

            var error = await ValidateAndNormalizeAsync(data, null);
            if (error != null) return BadRequest(new { message = error });

            var result = await _service.Add(data);
            return result ? Ok(new { message = "Event created" }) : BadRequest();
        }

        [HttpPut("{id}")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> Put(int id, [FromBody] CalendarEvent data)
        {
            data.EventID = id;
            // Fetched before the update so we can tell a genuine "just
            // published" transition (Publish to Mentors) apart from a plain
            // edit of an event that was already published — only the
            // former should notify Mentors.
            var existing = await _service.GetById(id);
            var wasPublished = existing?.IsPublished ?? false;

            var error = await ValidateAndNormalizeAsync(data, existing);
            if (error != null) return BadRequest(new { message = error });

            var result = await _service.Update(data);
            if (result && !wasPublished && data.IsPublished)
                await _emailService.NotifyCalendarUpdatedAsync(data);

            return result ? Ok(new { message = "Event updated" }) : NotFound();
        }

        [HttpDelete("{id}")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> Delete(int id)
        {
            var result = await _service.Delete(id);
            return result ? Ok(new { message = "Event deleted" }) : NotFound();
        }
    }
}
