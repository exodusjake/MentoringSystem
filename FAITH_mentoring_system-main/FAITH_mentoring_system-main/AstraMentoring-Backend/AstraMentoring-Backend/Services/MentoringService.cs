using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Repositories;

namespace AstraMentoring_Backend.Services
{
    public class MentoringService
    {
        private readonly IGenericRepository<Session> _sessionRepo;
        private readonly IGenericRepository<SessionRequest> _requestRepo;
        private readonly IGenericRepository<Attendance> _attendanceRepo;
        private readonly IGenericRepository<ProofOfSession> _proofRepo;

        public MentoringService(IGenericRepository<Session> s, IGenericRepository<SessionRequest> r, IGenericRepository<Attendance> a, IGenericRepository<ProofOfSession> p)
        {
            _sessionRepo = s; _requestRepo = r; _attendanceRepo = a; _proofRepo = p;
        }

        public async Task<IEnumerable<Session>> GetSessions() => await _sessionRepo.GetAllAsync();
        public async Task<IEnumerable<SessionRequest>> GetRequests() => await _requestRepo.GetAllAsync();
        public async Task<IEnumerable<Attendance>> GetAttendance() => await _attendanceRepo.GetAllAsync();
        public async Task<IEnumerable<ProofOfSession>> GetProof() => await _proofRepo.GetAllAsync();
    }
}