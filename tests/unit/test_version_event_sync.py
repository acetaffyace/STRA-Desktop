from types import SimpleNamespace

from apps.api.senti_next.routes import runs as route


def _news():
    return SimpleNamespace(
        gid="steam-news-1",
        title="New Content in Version 2.0",
        feed_label="Community Announcements",
        date=1_767_225_600,
        url="https://store.steampowered.com/news/app/570/view/steam-news-1",
    )


def test_sync_news_creates_resolved_official_anchor(monkeypatch):
    saved = []
    monkeypatch.setattr(route, "fetch_news_for_app", lambda *args, **kwargs: [_news()])
    monkeypatch.setattr(route.storage, "list_version_events", lambda app_id: [])
    monkeypatch.setattr(route.storage, "create_version_event", lambda event: saved.append(dict(event)) or dict(event))

    result = route.sync_news_version_events(570, route.NewsEventSyncRequest(news_count=10))

    assert result["events_created"] == 1
    assert result["events_resolved"] == 0
    assert saved[0]["event_status"] == "resolved"
    assert saved[0]["effective_at"] == saved[0]["event_date"]
    assert saved[0]["source_quality"] == "official_news_title_date"


def test_sync_news_promotes_existing_unresolved_official_event(monkeypatch):
    existing = {
        "event_id": "event-existing",
        "app_id": 570,
        "event_name": "New Content in Version 2.0",
        "event_date": "2026-01-01",
        "event_type": "content_update",
        "source": "steam_news:steam-news-1",
        "source_url": _news().url,
        "manual_verified": False,
        "event_status": "unresolved",
    }
    promoted = []
    monkeypatch.setattr(route, "fetch_news_for_app", lambda *args, **kwargs: [_news()])
    monkeypatch.setattr(route.storage, "list_version_events", lambda app_id: [existing])

    def resolve(event_id, **kwargs):
        promoted.append((event_id, kwargs))
        return {**existing, **kwargs, "event_status": "resolved"}

    monkeypatch.setattr(route.storage, "resolve_version_event_anchor", resolve)

    result = route.sync_news_version_events(570, route.NewsEventSyncRequest(news_count=10))

    assert result["events_created"] == 0
    assert result["events_resolved"] == 1
    assert promoted == [("event-existing", {"effective_at": "2026-01-01"})]
