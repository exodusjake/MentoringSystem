using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Repositories;

namespace AstraMentoring_Backend.Services
{
    public class MenteeProfilesService
    {
        private readonly IGenericRepository<MenteeProfile> _repo;
        public MenteeProfilesService(IGenericRepository<MenteeProfile> repo) { _repo = repo; }

        public async Task<IEnumerable<MenteeProfile>> GetAll() => await _repo.GetAllAsync();
        public async Task<MenteeProfile?> GetById(int id) => await _repo.GetByIdAsync(id);
        public async Task<bool> Add(MenteeProfile data) => await _repo.AddAsync(data);
        public async Task<bool> Update(MenteeProfile data) => await _repo.UpdateAsync(data);
        public async Task<bool> Delete(int id) => await _repo.DeleteAsync(id);
    }
}