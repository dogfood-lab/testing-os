using Core;
using Xunit;

public class LedgerTests
{
    [Fact]
    public void AddCounts() => Assert.Equal(1, new Ledger().Add());
}
