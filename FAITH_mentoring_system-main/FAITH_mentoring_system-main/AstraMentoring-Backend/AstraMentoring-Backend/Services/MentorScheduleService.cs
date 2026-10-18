using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Repositories;

namespace AstraMentoring_Backend.Services
{
    public class MentorScheduleService
    {
        private readonly IGenericRepository<MentorPersonalEvent> _repo;

        public MentorScheduleService(IGenericRepository<MentorPersonalEvent> repo)
        {
            _repo = repo;
        }

        public async Task<IEnumerable<MentorPersonalEvent>> GetByMentor(int mentorId)
        {
            var all = await _repo.GetAllAsync();
            return all.Where(e => e.MentorID == mentorId);
        }

        public async Task<MentorPersonalEvent?> GetById(int id) => await _repo.GetByIdAsync(id);
        public async Task<bool> Add(MentorPersonalEvent data) => await _repo.AddAsync(data);
        public async Task<bool> Update(MentorPersonalEvent data) => await _repo.UpdateAsync(data);
        public async Task<bool> Delete(int id) => await _repo.DeleteAsync(id);
    }
}
