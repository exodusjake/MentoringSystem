using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Repositories;

namespace AstraMentoring_Backend.Services
{
    public class AvailabilityService
    {
        private readonly IGenericRepository<Availability> _repo;
        public AvailabilityService(IGenericRepository<Availability> repo) { _repo = repo; }

        public async Task<IEnumerable<Availability>> GetAll() => await _repo.GetAllAsync();
        public async Task<Availability?> GetById(int id) => await _repo.GetByIdAsync(id);
        public async Task<bool> Add(Availability data)
        {
            data.EndTime = null;
            return await _repo.AddAsync(data);
        }
        public async Task<bool> Update(Availability data)
        {
            data.EndTime = null;
            return await _repo.UpdateAsync(data);
        }
        public async Task<bool> Delete(int id) => await _repo.DeleteAsync(id);
    }
}