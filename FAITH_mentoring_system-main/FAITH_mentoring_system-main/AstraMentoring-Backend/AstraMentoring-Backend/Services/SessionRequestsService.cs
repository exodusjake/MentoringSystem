using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Repositories;

namespace AstraMentoring_Backend.Services
{
    public class SessionRequestsService
    {
        private readonly IGenericRepository<SessionRequest> _repo;
        public SessionRequestsService(IGenericRepository<SessionRequest> repo) { _repo = repo; }

        public async Task<IEnumerable<SessionRequest>> GetAll() => await _repo.GetAllAsync();
        public async Task<SessionRequest?> GetById(int id) => await _repo.GetByIdAsync(id);
        public async Task<bool> Add(SessionRequest data) => await _repo.AddAsync(data);
        public async Task<bool> Update(SessionRequest data) => await _repo.UpdateAsync(data);
        public async Task<bool> Delete(int id) => await _repo.DeleteAsync(id);
    }
}