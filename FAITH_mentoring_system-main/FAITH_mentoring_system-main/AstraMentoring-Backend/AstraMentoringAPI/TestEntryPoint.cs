// Program.cs uses top-level statements, which implicitly generate an
// `internal partial class Program`. WebApplicationFactory<Program> (used
// by AstraMentoringAPI.Tests) needs that type to be public — this extends
// the same partial class from a separate file rather than editing
// Program.cs itself, since Program.cs currently carries unrelated,
// not-yet-committed changes this file must not get mixed into.
public partial class Program { }
