using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Repositories;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace AstraMentoring_Backend.Services
{
    public class CalendarEventsService
    {
        private readonly IGenericRepository<CalendarEvent> _repo;
        private readonly string _connectionString;

        public CalendarEventsService(IGenericRepository<CalendarEvent> repo, IConfiguration config)
        {
            _repo = repo;
            _connectionString = config.GetConnectionString("DefaultConnection")
                ?? "Server=(localdb)\\MSSQLLocalDB;Database=AstraMentoring;Trusted_Connection=True;MultipleActiveResultSets=True";
        }

        public async Task<IEnumerable<CalendarEvent>> GetAll() => await _repo.GetAllAsync();
        public async Task<CalendarEvent?> GetById(int id) => await _repo.GetByIdAsync(id);
        public async Task<bool> Add(CalendarEvent data) => await _repo.AddAsync(data);

        public async Task<bool> Update(CalendarEvent data)
        {
            using var conn = new SqlConnection(_connectionString);
            var rows = await conn.ExecuteAsync(
                @"UPDATE CalendarEvents
                  SET Title        = @Title,
                      StartDate    = @StartDate,
                      EndDate      = @EndDate,
                      EventType    = @EventType,
                      Description  = @Description,
                      Venue        = @Venue,
                      IsPublished  = @IsPublished,
                      SlotName     = @SlotName,
                      SchoolYear   = @SchoolYear,
                      Semester     = @Semester,
                      DeadlineDate = @DeadlineDate
                  WHERE EventID = @EventID",
                new
                {
                    data.EventID,
                    data.Title,
                    data.StartDate,
                    data.EndDate,
                    data.EventType,
                    data.Description,
                    data.Venue,
                    data.IsPublished,
                    data.SlotName,
                    data.SchoolYear,
                    data.Semester,
                    data.DeadlineDate
                });
            return rows > 0;
        }

        public async Task<bool> Delete(int id) => await _repo.DeleteAsync(id);

        // Pre-checks the same uniqueness the DB's UQ_CalendarEvents_Slot
        // index enforces (one Session Schedule / one Deadline per slot per
        // semester) — called before Add/Update so a duplicate produces a
        // friendly 409 message instead of a raw SQL 2601 exception reaching
        // the client as an unhelpful "Error 500".
        public async Task<bool> SlotExistsAsync(string slotName, string eventType, string schoolYear, string semester, int? excludeId)
        {
            using var conn = new SqlConnection(_connectionString);
            var count = await conn.ExecuteScalarAsync<int>(
                @"SELECT COUNT(*) FROM CalendarEvents
                  WHERE SlotName = @SlotName AND EventType = @EventType
                    AND SchoolYear = @SchoolYear AND Semester = @Semester
                    AND (@ExcludeId IS NULL OR EventID <> @ExcludeId)",
                new { SlotName = slotName, EventType = eventType, SchoolYear = schoolYear, Semester = semester, ExcludeId = excludeId });
            return count > 0;
        }
    }
}
