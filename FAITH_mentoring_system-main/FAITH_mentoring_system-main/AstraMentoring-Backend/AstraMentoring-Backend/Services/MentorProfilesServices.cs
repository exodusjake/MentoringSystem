using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Repositories;

namespace AstraMentoring_Backend.Services
{
    public class MentorProfilesService
    {
        private readonly IGenericRepository<MentorProfile> _repo;
        public MentorProfilesService(IGenericRepository<MentorProfile> repo) { _repo = repo; }

        public async Task<IEnumerable<MentorProfile>> GetAll() => await _repo.GetAllAsync();
        public async Task<MentorProfile?> GetById(int id) => await _repo.GetByIdAsync(id);
        public async Task<bool> Add(MentorProfile data) => await _repo.AddAsync(data);
        public async Task<bool> Update(MentorProfile data) => await _repo.UpdateAsync(data);
        public async Task<bool> Delete(int id) => await _repo.DeleteAsync(id);
    }
}