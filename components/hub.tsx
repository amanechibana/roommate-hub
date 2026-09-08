"use client";
import { SaveStatus } from "./ui/save-status";
import { EntryMenu, MemberCard, NoteComposer } from "./ui/house-controls";
import { DraggableRow } from "./ui/list-order";
import { PresenceRow, memberPaper } from "./ui/presence";

import { HouseCompanion } from "@/components/ui/house-companion";
import { expenseBalances } from "@/lib/expenses";
import ExpensesTab from "./expenses-tab";
import styles from "./hub.module.css";

import { AnimatedCheck } from "@/components/ui/animated-check";
import { Button } from "@/components/ui/button";
import { AnimatePresence, m } from "motion/react";

import HomeBoard from "@/components/home-board";
import HubSkeleton from "@/components/hub-skeleton";
import { DisplayButton } from "@/components/ui/display-button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { safeUrl, type Entry, type Kind, type Member } from "@/lib/model";
import {
  ArrowRight,
  ExternalLink,
  Home,
  Leaf,
  LogOut,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

import { categories, labels, money, tabs } from "@/lib/household-config";
import { useHousehold } from "@/lib/use-household";
import ActivityFeed from "./activity-feed";
import CalendarTab from "./calendar-tab";
import EntryDialog from "./entry-dialog";
import Auth from "./house-auth";
import { DayDialog, Empty, ShortcutsDialog } from "./house-dialogs";
import HouseholdSettings from "./household-settings";
export default function Hub() {
  const house = useHousehold();
  const {
    reduced,
    ready,
    loaded,
    session,
    setSession,
    demo,
    household,
    members,
    entries,
    tab,
    setTab,
    editing,
    setEditing,
    showShortcuts,
    setShowShortcuts,
    busy,
    error,
    setError,
    notice,
    noticeAction,
    setNoticeAction,
    undoDeletes,
    selectedDay,
    setSelectedDay,
    filter,
    setFilter,
    display,
    identity,
    choosingPerson,
    setChoosingPerson,
    uid,
    pending,
    savedIds,
    expenseController,
    taskOrder,
    shoppingOrder,
    today,
    changeDisplay,
    refresh,
    live,
    signOut,
    save,
    toggle,
    pushToTomorrow,
    handOff,
    toggleBought,
    togglePayment,
    coverBill,
    remove,
    undoDelete,
    choosePerson,
    tasks,
    shopping,
    filteredTasks,
    filteredShopping,
    notes,
    person,
    friendlyDate,
  } = house;
  const avatar = (member: Member, i: number) => (
    <MemberCard
      key={member.user_id}
      name={member.name}
      balance={
        expenseController.loaded && !expenseController.error
          ? expenseBalances(expenseController.expenses)[member.user_id] || 0
          : null
      }
      chores={
        tasks.filter(
          (entry) => !entry.done && entry.assignee === member.user_id,
        ).length
      }
    >
      <span title={member.name} className={`avatar tone-${i % 3}`}>
        {member.name.slice(0, 1).toUpperCase()}
      </span>
    </MemberCard>
  );
  const quickAdd = (kind: "task" | "request") => (
    <form
      className="quick-add"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const title = String(new FormData(form).get("title") || "").trim();
        if (!title) return;
        void save({
          kind,
          title,
          category: categories[kind][0],
          description: "",
          date: null,
          assignee: kind === "task" && filter === "Mine" ? uid : null,
          amount: null,
          url: "",
        });
        form.reset();
      }}
    >
      <input
        name="title"
        aria-label={`Quick add ${labels[kind]}`}
        placeholder={
          kind === "task"
            ? "Add a to-do and press Enter…"
            : "Add an item and press Enter…"
        }
        required
        maxLength={160}
      />
      <Button className="button small" aria-label={`Quick add ${labels[kind]}`}>
        <Plus size={16} />
        Add
      </Button>
    </form>
  );
  const addButton = (kind: Kind, text = `Add ${labels[kind]}`) => (
    <Button className="button small" onClick={() => setEditing({ kind })}>
      <Plus size={16} />
      {text}
    </Button>
  );
  const taskRow = (entry: Entry, index: number) => (
    <DraggableRow
      title={entry.title}
      index={index}
      count={filteredTasks.length}
      onMove={(to) => taskOrder.move(filteredTasks, index, to)}
      className={`task-row ${entry.done ? "completed" : ""}`}
      key={entry.id}
    >
      <Button
        className="checkbox"
        aria-label={`${entry.done ? "Reopen" : "Complete"} ${entry.title}`}
        aria-pressed={entry.done}
        onClick={() => void toggle(entry)}
      >
        {entry.done && <AnimatedCheck size={14} />}
      </Button>
      <Button
        className="entry-label"
        onClick={() => setEditing({ kind: entry.kind, entry })}
      >
        <span>
          {entry.title}
          {entry.series_id ? " ↻" : ""}
          {entry.rotation_members?.length ? " · Taking turns" : ""}
        </span>
        <small
          className={
            entry.date && entry.date < today && !entry.done ? "overdue" : ""
          }
        >
          {entry.date && entry.date < today && !entry.done ? "Overdue · " : ""}
          {friendlyDate(entry.date)} <span>·</span> {entry.category}
          {members.some(
            (m) => m.user_id === entry.created_by && m.name !== "Housemates",
          )
            ? ` · Added by ${person(entry.created_by)}`
            : ""}
        </small>
      </Button>
      {members.some(
        (m) => m.user_id === entry.assignee && m.name !== "Housemates",
      ) && (
        <span className="person-tag">
          <span
            className={`person-dot tone-${
              Math.max(
                0,
                members.findIndex((m) => m.user_id === entry.assignee),
              ) % 3
            }`}
          />
          {person(entry.assignee)}
        </span>
      )}
      <EntryMenu
        title={entry.title}
        onEdit={() => setEditing({ kind: entry.kind, entry })}
        onDelete={() => void remove(entry)}
        actions={
          entry.done
            ? []
            : [
                {
                  label:
                    entry.date && entry.date > today
                      ? "Push back a day"
                      : "Push to tomorrow",
                  onSelect: () => pushToTomorrow(entry),
                },
                ...members
                  .filter(
                    (m) =>
                      m.name !== "Housemates" && m.user_id !== entry.assignee,
                  )
                  .map((m) => ({
                    label: `Hand to ${m.name}`,
                    onSelect: () => handOff(entry, m),
                  })),
              ]
        }
      />
    </DraggableRow>
  );

  if (!ready)
    return display ? (
      <main className="auth-wrap">
        <Leaf size={36} />
        <p>Making room for you…</p>
      </main>
    ) : (
      <HubSkeleton />
    );
  if (!demo && !session) return <Auth onSuccess={() => setSession(true)} />;
  if (!demo && !loaded)
    return display ? (
      <main className="auth-wrap">
        <Leaf size={36} />
        <p>Opening your home…</p>
      </main>
    ) : (
      <HubSkeleton />
    );
  if (!household)
    return (
      <main className="auth-wrap">
        <section className="auth-card">
          <h1>Your home is taking a moment.</h1>
          <p role="alert">{error || "Could not load your household."}</p>
          <Button className="button" onClick={() => void refresh()}>
            Try again
          </Button>
          <Button className="text-button" onClick={() => void signOut()}>
            Sign out
          </Button>
        </section>
      </main>
    );

  if ((!demo && !identity) || choosingPerson)
    return (
      <main className="auth-wrap">
        <section className="auth-card">
          <p className="eyebrow">MAKE YOURSELF AT HOME</p>
          <h1>Who’s this?</h1>
          <p className="subtitle">Pick who’s using this device.</p>
          <div className="person-picker">
            {members
              .filter((m) => m.name !== "Housemates")
              .map((member, i) => (
                <Button
                  className="button secondary"
                  key={member.user_id}
                  aria-label={member.name}
                  disabled={busy}
                  onClick={() => void choosePerson(member)}
                >
                  <span className={`avatar tone-${i % 3}`}>
                    {member.name.slice(0, 1).toUpperCase()}
                  </span>
                  {member.name}
                </Button>
              ))}
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {!demo && (
            <Button className="text-button" onClick={() => void signOut()}>
              Sign out
            </Button>
          )}
        </section>
      </main>
    );

  const toasts = display ? null : (
    <div className="toast-stack">
      <AnimatePresence initial={false}>
        {notice && (
          <PresenceRow
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="toast"
            key="notice"
            role="status"
          >
            {notice}
          </PresenceRow>
        )}
        {noticeAction && (
          <PresenceRow
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="toast"
            key="notice-action"
            role="status"
          >
            <span>{noticeAction.text}</span>
            <Button
              className="undo-button"
              onClick={() => {
                noticeAction.run();
                setNoticeAction(null);
              }}
            >
              {noticeAction.label}
            </Button>
          </PresenceRow>
        )}
        {undoDeletes.map((item) => (
          <PresenceRow
            layout={reduced ? false : "position"}
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="toast"
            role="status"
            key={item.token}
          >
            <span>
              {item.entries.length > 1
                ? `${item.entries.length} occurrences deleted`
                : `Deleted “${item.entries[0]?.title}”`}
            </span>
            <Button
              className="undo-button"
              onClick={() => undoDelete(item.token)}
            >
              Undo
            </Button>
          </PresenceRow>
        ))}
      </AnimatePresence>
    </div>
  );

  const PageIcon = tabs.find((item) => item.name === tab)?.icon || Settings;
  const openTasks = tasks.filter((entry) => !entry.done);
  const doneCount = tasks.length - openTasks.length;
  const neededItems = shopping.filter((entry) => !entry.done);

  const boardProps = {
    activity: house.activity,
    household,
    entries,
    members,
    memberId: uid,
    expenses: expenseController,
    demo,
    live,
    error,
    onExit: () => changeDisplay(false),
    onOpen: (kind: Kind, entry?: Entry) => setEditing({ kind, entry }),
    onNavigate: setTab,
    onToggle: toggleBought,
  };
  if (display)
    return (
      <main>
        <HomeBoard {...boardProps} display />
        {toasts}
      </main>
    );

  return (
    <div
      className={`${styles.shell} app-shell ${tab === "Overview" || tab === "Calendar" ? "fitted-app" : ""}`}
    >
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Common Ground home">
          <span className="brand-icon">
            <Leaf size={24} />
          </span>
          <span>
            common
            <br />
            ground<span className="brand-dot">.</span>
          </span>
        </a>
        <span className="nav-label">{household.name}</span>
        <nav aria-label="Main navigation">
          {tabs.map(({ name, icon: Icon }) => (
            <Button
              key={name}
              className={tab === name ? "active" : ""}
              aria-current={tab === name ? "page" : undefined}
              onClick={() => setTab(name)}
            >
              {tab === name && (
                <m.span
                  className="nav-highlight"
                  layoutId={reduced ? undefined : "navigation"}
                  transition={{ type: "spring", stiffness: 360, damping: 32 }}
                  aria-hidden="true"
                />
              )}
              <Icon size={19} />
              <span>{name}</span>
              {name === "Shopping list" && (
                <span className="nav-count">
                  {shopping.filter((e) => !e.done).length}
                </span>
              )}
            </Button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <HouseCompanion />
          <Button
            className={`settings-link ${tab === "Our household" ? "selected" : ""}`}
            onClick={() => setTab("Our household")}
          >
            <Settings size={18} /> Our household
          </Button>
          <div className="sidebar-profile">
            <span
              className={`avatar tone-${
                Math.max(
                  0,
                  members.findIndex((m) => m.user_id === uid),
                ) % 3
              }`}
            >
              {person(uid || null).slice(0, 1)}
            </span>
            <div>
              <Button
                className="text-button"
                onClick={() => setChoosingPerson(true)}
                aria-label="Switch person"
              >
                {person(uid || null)}
              </Button>
              <small>{demo ? "Exploring the demo" : "Right at home"}</small>
            </div>
            {!demo && (
              <Button
                aria-label="Sign out"
                className="icon-button"
                onClick={() => void signOut()}
              >
                <LogOut size={17} />
              </Button>
            )}
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <HouseCompanion variant="compact" />
          <span>
            <Home size={15} /> Our home <span className="slash">/</span>{" "}
            <strong>{tab}</strong>
          </span>
          <div>
            <DisplayButton onClick={() => changeDisplay(true)} />
            <span className="private-label">
              <ShieldCheck size={14} />
              {demo ? "Demo home" : "Private household"}
            </span>
            <Button
              className="icon-button avatar-stack"
              aria-label="Open household settings"
              onClick={() => setTab("Our household")}
            >
              {members.map((member, i) => (
                <span
                  key={member.user_id}
                  title={member.name}
                  className={`avatar tone-${i % 3}`}
                >
                  {member.name.slice(0, 1).toUpperCase()}
                </span>
              ))}
            </Button>
            {!demo && (
              <Button
                className="icon-button"
                aria-label="Sign out of household"
                onClick={() => void signOut()}
              >
                <LogOut size={16} />
              </Button>
            )}
          </div>
        </header>
        <main
          key={tab}
          className={`content ${tab === "Overview" ? "home-content" : tab === "Calendar" ? "calendar-content" : ""}`}
        >
          <SaveStatus demo={demo} />
          {demo && (
            <div className="demo-banner">
              <span>
                <Sparkles size={15} /> Sample household · Try everything.
                Changes last until you reload.
              </span>
              <Button onClick={() => setTab("Our household")}>
                Connect your home <ArrowRight size={14} />
              </Button>
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
              <Button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </Button>
            </div>
          )}
          {tab !== "Overview" && tab !== "Expenses" && (
            <m.div
              key={tab}
              initial={reduced ? false : { opacity: 0.5 }}
              animate={{ opacity: 1 }}
              className="page-heading"
            >
              <div className="heading-copy">
                {tab !== "Calendar" && (
                  <span className="page-symbol" aria-hidden="true">
                    <PageIcon size={23} />
                  </span>
                )}
                <div>
                  <h1>{tab}</h1>
                  <p className="subtitle">
                    {
                      {
                        Calendar: "Plans and dated to-dos for your home.",
                        "To-dos": `${openTasks.length} open · ${openTasks.filter((entry) => entry.assignee === uid).length} assigned to you`,
                        "Shopping list": `${neededItems.length} ${neededItems.length === 1 ? "item" : "items"} to pick up`,
                        "House notes": `${notes.length} ${notes.length === 1 ? "note" : "notes"} shared with your home`,
                        "Our household": `${household.name} · ${members.length} ${members.length === 1 ? "housemate" : "housemates"}`,
                        Overview: "",
                        Expenses: "",
                      }[tab]
                    }
                  </p>
                </div>
              </div>
              {tab !== "Our household" &&
                addButton(
                  tab === "Calendar"
                    ? "event"
                    : tab === "Shopping list"
                      ? "request"
                      : tab === "House notes"
                        ? "note"
                        : "task",
                )}
            </m.div>
          )}

          {tab === "Overview" && <HomeBoard {...boardProps} />}
          {tab === "Expenses" && (
            <ExpensesTab
              controller={expenseController}
              members={members.filter((member) => member.name !== "Housemates")}
              memberId={uid!}
              pending={shopping.filter((e) => !e.done && e.amount != null)}
            />
          )}

          {tab === "Calendar" && <CalendarTab {...house} />}
          {tab === "To-dos" && (
            <section className="panel entry-panel">
              <div className="panel-heading">
                <SegmentedControl
                  label="To-do filters"
                  values={["All", "Mine", "Open", "Done"]}
                  value={filter}
                  onChange={setFilter}
                />
                <div className="list-progress">
                  <span>
                    {doneCount} of {tasks.length} done
                  </span>
                  <progress
                    aria-label="To-do completion"
                    value={doneCount}
                    max={Math.max(1, tasks.length)}
                  />
                </div>
              </div>
              {quickAdd("task")}
              <AnimatePresence initial={false}>
                {filteredTasks.map(taskRow)}
              </AnimatePresence>
              {!tasks.filter(
                (e) =>
                  filter === "All" ||
                  (filter === "Mine" && e.assignee === uid) ||
                  (filter === "Open" && !e.done) ||
                  (filter === "Done" && e.done),
              ).length && (
                <Empty text="Nothing here. A little breathing room." />
              )}
            </section>
          )}

          {tab === "Shopping list" && (
            <section className="panel entry-panel">
              <div className="panel-heading">
                <SegmentedControl
                  label="Shopping filters"
                  values={["All", "Need", "Want", "Bought"]}
                  value={filter}
                  onChange={setFilter}
                />
                {filter !== "Bought" &&
                  filteredShopping.some((e) => e.amount != null) && (
                    <span className="subtle">
                      Estimated total ·{" "}
                      <strong>
                        {money(
                          filteredShopping.reduce(
                            (sum, e) => sum + Number(e.amount || 0),
                            0,
                          ),
                        )}
                      </strong>
                    </span>
                  )}
              </div>
              {quickAdd("request")}
              <div className="shopping-list">
                <AnimatePresence initial={false}>
                  {filteredShopping.map((entry, index) => (
                    <DraggableRow
                      title={entry.title}
                      index={index}
                      count={filteredShopping.length}
                      onMove={(to) =>
                        shoppingOrder.move(filteredShopping, index, to)
                      }
                      className={`task-row shopping-row ${entry.done ? "completed" : ""}`}
                      key={entry.id}
                    >
                      <Button
                        className="checkbox"
                        aria-label={`${entry.done ? "Reopen" : "Mark as bought"}: ${entry.title}`}
                        aria-pressed={entry.done}
                        onClick={() => toggleBought(entry)}
                      >
                        {entry.done && <AnimatedCheck size={14} />}
                      </Button>
                      <Button
                        className="entry-label"
                        onClick={() => setEditing({ kind: "request", entry })}
                      >
                        <h2>{entry.title}</h2>
                        <small>
                          {entry.category}
                          {entry.description ? ` · ${entry.description}` : ""}
                        </small>
                        {members.some(
                          (m) =>
                            m.user_id === entry.created_by &&
                            m.name !== "Housemates",
                        ) && <small>Added by {person(entry.created_by)}</small>}
                      </Button>
                      {entry.amount != null && (
                        <strong className="row-price">
                          {money(entry.amount)}
                        </strong>
                      )}
                      {safeUrl(entry.url) && (
                        <a
                          className="icon-button"
                          aria-label={`View ${entry.title} in store`}
                          href={safeUrl(entry.url)!}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink size={16} />
                        </a>
                      )}
                      <EntryMenu
                        title={entry.title}
                        onEdit={() => setEditing({ kind: entry.kind, entry })}
                        onDelete={() => void remove(entry)}
                      />
                    </DraggableRow>
                  ))}
                </AnimatePresence>
              </div>
              {!shopping.filter((e) =>
                filter === "Bought"
                  ? e.done
                  : !e.done && (filter === "All" || e.category === filter),
              ).length && (
                <Empty text="Nothing on this list yet. Add something for your home." />
              )}
            </section>
          )}

          {tab === "House notes" && (
            <div className="notes-page">
              <NoteComposer
                onSave={(title, description) =>
                  void save({
                    kind: "note",
                    title,
                    description,
                    category: "Note",
                    date: null,
                    assignee: null,
                    amount: null,
                    url: "",
                  })
                }
              />
              <div className="notes-grid">
                <AnimatePresence>
                  {notes.map((entry, index) => (
                    <PresenceRow
                      className="notice-board"
                      key={entry.id}
                      paper={entry.id}
                      index={index}
                      style={{
                        backgroundColor: memberPaper(
                          entry.assignee || entry.created_by,
                        ),
                      }}
                      layoutId={reduced ? undefined : `note-${entry.id}`}
                    >
                      <span className="tape" />
                      <EntryMenu
                        title={entry.title}
                        onEdit={() => setEditing({ kind: "note", entry })}
                        onConvert={() => setEditing({ kind: "note", entry })}
                        onDelete={() => void remove(entry)}
                      />
                      <Button
                        className="note-preview"
                        onClick={() => setEditing({ kind: "note", entry })}
                      >
                        <h3>{entry.title}</h3>
                        <p>{entry.description}</p>
                        <span>
                          — {person(entry.assignee || entry.created_by)}
                        </span>
                      </Button>
                    </PresenceRow>
                  ))}
                </AnimatePresence>
                {!notes.length && (
                  <Empty text="Your fridge is a blank canvas. Leave a note." />
                )}
              </div>
            </div>
          )}

          {tab === "Our household" && (
            <>
              <HouseholdSettings {...house} avatar={avatar} />
              <ActivityFeed activity={house.activity} members={members} />
            </>
          )}
        </main>
      </div>
      {toasts}
      <AnimatePresence>
        {selectedDay && (
          <DayDialog
            key="day"
            date={selectedDay}
            entries={entries.filter(
              (e) =>
                e.date === selectedDay && ["task", "event"].includes(e.kind),
            )}
            person={person}
            onClose={() => setSelectedDay(null)}
            onOpen={(entry) => {
              setSelectedDay(null);
              setEditing({ kind: entry.kind, entry });
            }}
            onAdd={() => {
              setEditing({ kind: "event", date: selectedDay });
              setSelectedDay(null);
            }}
          />
        )}
        {editing && (
          <EntryDialog
            key="entry"
            editing={{
              ...editing,
              entry: editing.entry
                ? entries.find(
                    (e) =>
                      e.id ===
                      (savedIds.current.get(editing.entry!.id) ||
                        editing.entry!.id),
                  ) || editing.entry
                : undefined,
            }}
            uid={uid}
            onPayment={togglePayment}
            onCover={coverBill}
            members={members.filter((m) => m.name !== "Housemates")}
            busy={busy}
            error={error}
            onClose={() => {
              if (!busy) {
                setEditing(null);
                setError("");
              }
            }}
            onSave={save}
            onDelete={remove}
          />
        )}
        {showShortcuts && (
          <ShortcutsDialog
            key="shortcuts"
            onClose={() => setShowShortcuts(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
