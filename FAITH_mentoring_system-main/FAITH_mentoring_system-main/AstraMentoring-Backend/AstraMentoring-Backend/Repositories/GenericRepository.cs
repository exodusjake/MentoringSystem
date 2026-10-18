using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Reflection;
using System.Data;

namespace AstraMentoring_Backend.Repositories
{
    public class GenericRepository<T> : IGenericRepository<T> where T : class
    {
        private readonly string _connectionString;

        public GenericRepository(IConfiguration configuration)
        {
            _connectionString = configuration.GetConnectionString("DefaultConnection")
                ?? "Server=(localdb)\\MSSQLLocalDB;Database=AstraMentoring;Trusted_Connection=True;MultipleActiveResultSets=True";
        }

        private IDbConnection CreateConnection() => new SqlConnection(_connectionString);

        private string GetTableName() =>
            typeof(T).GetCustomAttribute<TableAttribute>()?.Name ?? typeof(T).Name;

        private string GetPrimaryKeyName()
        {
            var keyProp = typeof(T).GetProperties()
                .FirstOrDefault(p => p.GetCustomAttribute<KeyAttribute>() != null);
            return keyProp?.Name ?? "ID";
        }

        public async Task<IEnumerable<T>> GetAllAsync()
        {
            using var conn = CreateConnection();
            return await conn.QueryAsync<T>($"SELECT * FROM {GetTableName()}");
        }

        public async Task<T?> GetByIdAsync(int id)
        {
            using var conn = CreateConnection();
            var pkName = GetPrimaryKeyName();
            return await conn.QueryFirstOrDefaultAsync<T>(
                $"SELECT * FROM {GetTableName()} WHERE {pkName} = @Id", new { Id = id });
        }
        public async Task<bool> AddAsync(T entity)
        {
            using var conn = CreateConnection();
            var pkName = GetPrimaryKeyName();
            var props = typeof(T).GetProperties()
                .Where(p => p.Name != pkName)
                .ToList();
            var columns = string.Join(", ", props.Select(p => p.Name));
            var values = string.Join(", ", props.Select(p => "@" + p.Name));

            var sql = $"INSERT INTO {GetTableName()} ({columns}) VALUES ({values}); SELECT SCOPE_IDENTITY();";

            var newId = await conn.ExecuteScalarAsync<int?>(sql, entity);

            if (newId.HasValue && newId.Value > 0)
            {
                var pkProp = typeof(T).GetProperty(pkName);
                pkProp?.SetValue(entity, newId.Value);
            }

            return true;
        }

        public async Task<bool> UpdateAsync(T entity)
        {
            using var conn = CreateConnection();
            var pkName = GetPrimaryKeyName();
            var props = typeof(T).GetProperties()
                .Where(p => p.Name != pkName)
                .Where(p =>
                {
                    var val = p.GetValue(entity);
                    // Skip DateTime fields that were not provided by the client
                    // (they arrive as DateTime.MinValue after JSON deserialization)
                    return !(val is DateTime dt && dt == DateTime.MinValue);
                })
                .ToList();
            var setClause = string.Join(", ", props.Select(p => $"{p.Name} = @{p.Name}"));
            var sql = $"UPDATE {GetTableName()} SET {setClause} WHERE {pkName} = @{pkName}";
            var rows = await conn.ExecuteAsync(sql, entity);
            return rows > 0;
        }

        public async Task<bool> DeleteAsync(int id)
        {
            using var conn = CreateConnection();
            var pkName = GetPrimaryKeyName();
            var sql = $"DELETE FROM {GetTableName()} WHERE {pkName} = @Id";
            var rows = await conn.ExecuteAsync(sql, new { Id = id });
            return rows > 0;
        }

        public IQueryable<T> GetAll()
        {
            using var conn = CreateConnection();
            var data = conn.Query<T>($"SELECT * FROM {GetTableName()}").ToList();
            return data.AsQueryable();
        }

        public async Task Create(T entity)
        {
            await AddAsync(entity);
        }
    }
}