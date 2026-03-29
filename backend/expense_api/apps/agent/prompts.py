"""
Pre-defined prompt templates for the agent.

Each template produces a ready-to-run query string that can be passed
directly to run_query(). Templates accept optional parameters so the
caller can customise time range, table name, etc.
"""

from typing import Callable


class PromptTemplate:
    def __init__(self, name: str, description: str, build: Callable[..., str]):
        self.name = name
        self.description = description
        self._build = build

    def render(self, **kwargs) -> str:
        return self._build(**kwargs)

    def to_dict(self) -> dict:
        return {"name": self.name, "description": self.description}


def _analyze_expenses(period: str = "this month") -> str:
    return (
        f"Analyze my expenses for {period}. "
        "Get my tables, identify expense-related ones, read their content, "
        "summarise spending by category, and highlight the top 3 spending "
        "categories with saving suggestions."
    )


def _summarize_data(period: str = "this month") -> str:
    return (
        f"Generate a complete summary of all my tracked data for {period}. "
        "List every table, show row counts, and surface any notable trends."
    )


def _weekly_review(week: str = "this week") -> str:
    return (
        f"Give me a weekly review for {week}. "
        "Check all my tables for entries from this period, compare to the "
        "previous week if data is available, and suggest what to focus on next week."
    )


def _data_health_check() -> str:
    return (
        "Run a health check on all my tables. "
        "Look for missing values, duplicate entries, inconsistent column usage, "
        "and tables that haven't been updated recently. Report findings clearly."
    )


REGISTRY: dict[str, PromptTemplate] = {
    t.name: t
    for t in [
        PromptTemplate("analyze-expenses", "Summarise spending by category for a given period", _analyze_expenses),
        PromptTemplate("summarize-data", "Full data summary across all tables for a given period", _summarize_data),
        PromptTemplate("weekly-review", "Compare this week's entries against the previous week", _weekly_review),
        PromptTemplate("data-health-check", "Find missing values, duplicates, and stale tables", _data_health_check),
    ]
}
