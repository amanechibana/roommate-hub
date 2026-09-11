"use client";
import { DisplayButton } from "@/components/ui/display-button";
import { HouseCompanion } from "@/components/ui/house-companion";
import { tabs } from "@/lib/household-config";
import {
  CalendarDays,
  CheckCheck,
  Cloud,
  Coffee,
  Heart,
  Home,
  Leaf,
  LogOut,
  Plus,
  Settings,
  ShieldCheck,
  ShoppingBasket,
  Sparkles,
  StickyNote,
  Wallet,
} from "lucide-react";
import { CommuteTrainGhosts } from "./commute-strip";
import styles from "./hub.module.css";

const line = (width: string) => (
  <span className="skeleton skeleton-line" style={{ width }} />
);

const ghostRow = (className: string, key: number) => (
  <div className={className} key={key}>
    <span className="skeleton skeleton-badge" />
    <div className="board-entry-copy">
      <strong>{line("11em")}</strong>
      <small>{line("7em")}</small>
    </div>
  </div>
);

/* The loading screen is the real shell: same classes, same chrome, ghost
   copy. Data then lands in place instead of replacing a centered spinner. */
export default function HubSkeleton() {
  return (
    <div className={`${styles.shell} app-shell`} aria-busy="true">
      <p role="status" className="flip-sr">
        Opening your home…
      </p>
      <aside className="sidebar" inert>
        <a className="brand" href="/" aria-label="Common Ground home">
          <span className="brand-icon">
            <Leaf size={24} />
          </span>
          <span className="brand-text">
            common
            <br />
            ground<span className="brand-dot">.</span>
          </span>
        </a>
        <span className="nav-label">{line("6em")}</span>
        <nav aria-label="Main navigation">
          {tabs.map(({ name, icon: Icon }) => (
            <button
              type="button"
              key={name}
              className={name === "Overview" ? "active" : ""}
            >
              {name === "Overview" && (
                <span className="nav-highlight" aria-hidden="true" />
              )}
              <Icon size={19} />
              <span>{name}</span>
              {name === "Shopping list" && (
                <span className="nav-count">&nbsp;</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="rail-companion">
            <HouseCompanion />
          </div>
          <button type="button" className="ui-button settings-link">
            <Settings size={18} /> Our household
          </button>
          <div className="sidebar-profile">
            <span className="profile-switch">
              <span className="skeleton skeleton-avatar" />
              <span className="profile-copy">
                {line("5em")}
                <small>Right at home</small>
              </span>
            </span>
            <span className="icon-button">
              <LogOut size={17} />
            </span>
          </div>
        </div>
      </aside>
      <div className="main-shell" inert>
        <header className="topbar">
          <HouseCompanion variant="compact" />
          <span>
            <Home size={15} /> Our home <span className="slash">/</span>{" "}
            <strong>Overview</strong>
          </span>
          <div>
            <DisplayButton onClick={() => {}} />
            <span className="private-label">
              <ShieldCheck size={14} />
              Private household
            </span>
            <span className="icon-button avatar-stack">
              <span className="avatar skeleton skeleton-avatar" />
              <span className="avatar skeleton skeleton-avatar" />
            </span>
            <span className="icon-button">
              <LogOut size={16} />
            </span>
          </div>
        </header>
        <main className="content home-content">
          <section className="home-board everyday-board">
            <header className="board-welcome">
              <div>
                <p className="board-kicker">
                  <Coffee size={16} />
                  {line("6em")}
                </p>
                <h1>{line("7.5em")}</h1>
                <p className="board-summary">{line("16em")}</p>
                <div className="board-balance">
                  <Wallet size={14} aria-hidden="true" />
                  <span>{line("8em")}</span>
                </div>
                <p className="board-lately">
                  <Sparkles size={13} aria-hidden="true" />
                  {line("12em")}
                </p>
              </div>
              <div className="board-quick-actions">
                <button type="button" className="ui-button">
                  <Plus size={16} />
                  To-do
                </button>
                <button type="button" className="ui-button">
                  <ShoppingBasket size={16} />
                  Item
                </button>
                <button type="button" className="ui-button">
                  <CalendarDays size={16} />
                  Plan
                </button>
              </div>
            </header>
            <section className="commute-strip">
              <div className="commute-weather">
                <Cloud aria-hidden="true" />
                <div className="commute-weather-copy">
                  <strong>{line("1.4em")}</strong>
                  <small>{line("7em")}</small>
                </div>
              </div>
              <div className="commute-trains">
                <CommuteTrainGhosts />
              </div>
            </section>
            <div className="noticeboard-grid">
              <section className="board-card plans-card">
                <div className="board-card-heading">
                  <h2>
                    <CalendarDays size={19} />
                    Up next
                  </h2>
                  <span>{line("3.5em")}</span>
                </div>
                <div className="board-rows">
                  {[0, 1, 2].map((i) => ghostRow("board-plan", i))}
                </div>
              </section>
              <section className="board-card chores-card">
                <div className="board-card-heading">
                  <h2>
                    <CheckCheck size={19} />A little housework
                  </h2>
                  <span>{line("3.5em")}</span>
                </div>
                <div className="board-rows">
                  {[0, 1, 2].map((i) => ghostRow("board-task", i))}
                </div>
              </section>
              <section className="board-card groceries-card">
                <div className="board-card-heading">
                  <h2>
                    <ShoppingBasket size={19} />
                    While you’re out
                  </h2>
                  <span>{line("3.5em")}</span>
                </div>
                <div className="board-rows">
                  {[0, 1, 2].map((i) => ghostRow("board-shopping", i))}
                </div>
              </section>
              <section className="board-card fridge-card">
                <div className="board-card-heading">
                  <h2>
                    <StickyNote size={19} />
                    On the fridge
                  </h2>
                  <Heart size={18} />
                </div>
                <div className="board-rows">
                  {[0, 1, 2].map((i) => ghostRow("board-task", i))}
                </div>
              </section>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
