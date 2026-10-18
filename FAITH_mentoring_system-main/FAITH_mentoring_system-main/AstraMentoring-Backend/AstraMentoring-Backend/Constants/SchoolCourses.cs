namespace AstraMentoring_Backend.Constants;

// Approved academic catalog formerly duplicated in Admin User Management.
// Course-only profiles do not need a Sections row or SectionID.
public static class SchoolCourses
{
    public static readonly IReadOnlyDictionary<string,string[]> Catalog = new Dictionary<string,string[]>(StringComparer.OrdinalIgnoreCase)
    {
        ["School of Technology"] = new[] { "BSECE", "BSEE", "BSCPE", "BSIE", "BSCS", "BSIT", "BSEMC" },
        ["School of Management"] = new[] { "BSA", "BSMA", "BSENTREP", "BSBA-MM", "BSE", "BSHM", "BSTM" },
        ["School of Humanities"] = new[] { "BAC", "BEEd", "BSE-Eng", "BSE-Math", "BPE", "BSESS", "BSN", "BSMLS", "BSP", "BSCRIM", "BFS" }
    };
    public static string NormalizeCode(string? value) => string.Concat((value ?? "").Where(c => !char.IsWhiteSpace(c))).ToUpperInvariant();
    public static (string School,string Course)? Resolve(string? school,string? course)
    {
        var entry=Catalog.FirstOrDefault(e=>string.Equals(e.Key,school?.Trim(),StringComparison.OrdinalIgnoreCase));
        if(entry.Key==null)return null;
        var code=entry.Value.FirstOrDefault(c=>NormalizeCode(c)==NormalizeCode(course));
        return code==null ? null : (entry.Key,code);
    }
}
