namespace Core;

public sealed class Ledger
{
    private int _entries;

    public int Add() => ++_entries;
}
