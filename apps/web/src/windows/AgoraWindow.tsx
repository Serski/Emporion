import { useState } from "react";
import { buildingLevel, houseView, marketView, type MarketRow } from "@emporion/engine";
import { asset, content } from "../content";
import { int, pct } from "../format";
import { Icon } from "../icons";
import { useNav, type MarketTab } from "../nav";
import { GoodIcon, Modal, Portrait, Stepper, Tabs, art, goodLabel, useSession } from "../ui";

// "1 lot of wood", "3 lots of wood", "2 wine", "2 Pentekonters".
function amount(n: number, id: string, name: string, lot: number): string {
  if (lot > 1) return `${n} lot${n === 1 ? "" : "s"} of ${name.toLowerCase()}`;
  if (content.ships[id]) return `${n} ${name}${n === 1 ? "" : "s"}`;
  return `${n} ${name.toLowerCase()}`;
}

const GROUPS: { id: MarketRow["group"]; label: string }[] = [
  { id: "resources", label: "Your town's stores" },
  { id: "goods", label: "Goods" },
  { id: "materials", label: "Materials" },
  { id: "naval", label: "Naval & ships" },
];

// MASSALIA's Agora: the NPC market's goods at seasonal prices, people to
// hire, and the players' stalls. Trades are made from the town on screen.
export function AgoraWindow({ tab: initial, onClose }: { tab?: MarketTab; onClose: () => void }) {
  const s = useSession();
  const [tab, setTab] = useState<MarketTab>(initial ?? "goods");
  const now = s.now();
  const v = s.state.villages[s.villageId]!;
  const hasAgora = buildingLevel(v, content.massalia.market.building) > 0;
  const house = houseView(s.state, content, s.player, now);
  return (
    <Modal title="The Agora" eyebrow={`Market · ${house.season.name} · ${v.name}`} onClose={onClose} wide banner={art("banner-market")}>
      <div className="purse-line">
        <span className="purse">
          <Icon name="coin" size={18} />
          <strong>{int(house.purse)}</strong> {house.currency.name.toLowerCase()} in your purse
        </span>
        <span className="muted small">People cost {house.upkeepPerSeason} dr a season.</span>
      </div>
      {!hasAgora && <p className="note note--warn">{v.name} has no Agora. Build one to buy, sell, hire or keep a stall here. The prices below are this season's.</p>}
      <Tabs
        tabs={[
          { id: "goods", label: "Goods" },
          { id: "people", label: "People" },
          { id: "stalls", label: "Player market" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "goods" && <GoodsTab enabled={hasAgora} />}
      {tab === "people" && <PeopleTab enabled={hasAgora} />}
      {tab === "stalls" && <StallsTab enabled={hasAgora} />}
    </Modal>
  );
}

function GoodsTab({ enabled }: { enabled: boolean }) {
  const s = useSession();
  const now = s.now();
  const v = s.state.villages[s.villageId]!;
  const view = marketView(s.state, content, s.player, v.id, now);
  return (
    <>
      <p className="lede">The agora buys and sells every good at a seasonal price. It sells dear and buys cheap, so a trade never fails for want of a buyer. Wood, stone, iron and wheat trade by the lot of {content.massalia.market.resourceLot}.</p>
      {GROUPS.map((g) => {
        const rows = view.rows.filter((r) => r.group === g.id);
        if (rows.length === 0) return null;
        return (
          <section key={g.id} className="subpanel">
            <h3 className="subpanel__title">{g.label}</h3>
            <ul className="trade-list">
              {rows.map((r) => (
                <TradeRow key={r.id} row={r} enabled={enabled} />
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

function TradeRow({ row, enabled }: { row: MarketRow; enabled: boolean }) {
  const s = useSession();
  const v = s.state.villages[s.villageId]!;
  const [n, setN] = useState(1);
  const lot = row.lot > 1 ? ` (${row.lot})` : "";
  const affordable = Math.max(0, Math.floor(s.player.purse / row.buy));
  return (
    <li className="trade-row">
      <GoodIcon id={row.id} size={36} />
      <div className="trade-row__text">
        <div className="trade-row__name">
          {row.name}
          {row.have > 0 && <span className="muted small"> · {row.lot > 1 ? `${row.have} lot${row.have === 1 ? "" : "s"} in ${v.name}` : `own ${row.have}`}</span>}
        </div>
        <div className="small muted">
          buy {row.buy} dr · sell {row.sell} dr{row.lot > 1 ? ` a lot${lot}` : ""}
        </div>
      </div>
      <div className="trade-row__act">
        <Stepper id={`qty-${row.id}`} label={`${row.name} to trade`} value={n} min={1} max={Math.max(1, Math.max(row.have, affordable, 1))} onChange={setN} />
        <button className="btn btn--sell btn--small" disabled={!enabled || row.have < n} onClick={() => s.run((g, t) => g.vendorTrade(s.active, v.id, "sell", row.id, n, t), `Sold ${amount(n, row.id, row.name, row.lot)} for ${n * row.sell} dr.`)}>
          Sell {n} · +{n * row.sell} dr
        </button>
        <button className="btn btn--buy btn--small" disabled={!enabled || s.player.purse < n * row.buy} onClick={() => s.run((g, t) => g.vendorTrade(s.active, v.id, "buy", row.id, n, t), `Bought ${amount(n, row.id, row.name, row.lot)} for ${n * row.buy} dr.`)}>
          Buy {n} · {n * row.buy} dr
        </button>
      </div>
    </li>
  );
}

function PeopleTab({ enabled }: { enabled: boolean }) {
  const s = useSession();
  const now = s.now();
  const house = houseView(s.state, content, s.player, now);
  const posture = house.posture;
  const spymaster = house.people.find((p) => p.id === "spymaster")?.have ?? 0;
  return (
    <>
      <p className="lede">Hire hands and household for your house. They are paid at the turn of each season and eat wheat in your capital.</p>
      <ul className="people-list">
        {house.people.map((p) => (
          <PersonRow key={p.id} id={p.id} enabled={enabled} />
        ))}
      </ul>
      {spymaster > 0 && (
        <section className="subpanel">
          <h3 className="subpanel__title">Your spy network</h3>
          <p className="small">
            Spymaster posture · {posture === "guard" ? `Guarding the house (+${content.massalia.intrigue.defence.spymasterGuard} against plots)` : `Hunting for openings (+${content.massalia.intrigue.attack.spymasterHunt} to your plots)`}
          </p>
          <div className="actions">
            <button className={`btn btn--small${posture === "guard" ? " btn--buy" : ""}`} onClick={() => s.run((g, t) => g.setPosture(s.active, "guard", t), "Your spymaster guards the house.")}>
              Guard the house
            </button>
            <button className={`btn btn--small${posture === "hunt" ? " btn--buy" : ""}`} onClick={() => s.run((g, t) => g.setPosture(s.active, "hunt", t), "Your spymaster hunts for openings.")}>
              Hunt for openings
            </button>
          </div>
        </section>
      )}
    </>
  );
}

function PersonRow({ id, enabled }: { id: string; enabled: boolean }) {
  const s = useSession();
  const now = s.now();
  const p = houseView(s.state, content, s.player, now).people.find((x) => x.id === id)!;
  const [n, setN] = useState(1);
  const cap = p.max === null ? 99 : Math.max(0, p.max - p.have);
  const hireMax = Math.max(1, Math.min(cap, 99));
  return (
    <li className="person-row">
      {p.portrait ? <Portrait stem={`${p.portrait}-prime`} size={56} /> : <img className="person-row__icon" src={asset(p.icon ?? "")} alt="" width={56} height={56} />}
      <div className="person-row__text">
        <div className="person-row__name">
          {p.name}
          {p.have > 0 && (
            <span className="muted small">
              {" "}
              · own {p.have}
              {p.busy > 0 ? ` (${p.busy} at work)` : ""}
            </span>
          )}
        </div>
        <div className="small">
          {p.about}
          {Object.entries(p.production).map(([r, n]) => ` Each makes +${int(n)} ${goodLabel(r).toLowerCase()} an hour.`)}
          {p.culturePerDay > 0 ? ` Each adds +${int(p.culturePerDay)} culture a day in your capital.` : ""}
        </div>
        <div className="small muted">
          hire {p.hire} dr · upkeep {p.upkeep} dr a season{p.food > 0 ? ` · eats ${int(p.food)} wheat an hour` : ""}
          {p.max !== null ? ` · at most ${p.max}` : ""}
        </div>
      </div>
      <div className="person-row__act">
        <Stepper id={`hire-${p.id}`} label={`${p.plural} to hire`} value={Math.min(n, hireMax)} min={1} max={hireMax} onChange={setN} />
        {p.have > 0 && (
          <button className="btn btn--sell btn--small" disabled={p.have - p.busy < n} onClick={() => s.run((g, t) => g.dismiss(s.active, p.id, n, t), p.sellBack > 0 ? `Sold for ${n * p.sellBack} dr.` : `${p.dismiss}ed.`)}>
            {p.dismiss} {n}
            {p.sellBack > 0 ? ` · +${n * p.sellBack} dr` : ""}
          </button>
        )}
        <button className="btn btn--buy btn--small" disabled={!enabled || cap <= 0 || s.player.purse < n * p.hire} onClick={() => s.run((g, t) => g.hire(s.active, s.villageId, p.id, n, t), `Hired ${n} ${n === 1 ? p.name.toLowerCase() : p.plural.toLowerCase()}.`)}>
          Hire {n} · {n * p.hire} dr
        </button>
      </div>
    </li>
  );
}

function StallsTab({ enabled }: { enabled: boolean }) {
  const s = useSession();
  const nav = useNav();
  const now = s.now();
  const v = s.state.villages[s.villageId]!;
  const view = marketView(s.state, content, s.player, v.id, now);
  const sellable = view.rows.filter((r) => r.have > 0);
  const [good, setGood] = useState<string>(sellable[0]?.id ?? "");
  const row = view.rows.find((r) => r.id === good) ?? sellable[0];
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState(row?.buy ?? 5);
  const full = view.myStalls >= view.stallCap;
  return (
    <>
      <p className="lede">Houses sell to houses here, at their own price. The city takes {pct(view.taxRate)} of every sale.</p>
      <section className="subpanel">
        <div className="subpanel__head">
          <h3 className="subpanel__title">Sell</h3>
          <span className="tag">
            Your stalls: {view.myStalls} of {view.stallCap}
          </span>
        </div>
        {sellable.length === 0 ? (
          <p className="muted small">You hold nothing to sell. Goods you buy, craft or receive appear here, and your town's stores by the lot.</p>
        ) : (
          <form
            className="stall-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!row) return;
              const r = s.run((g, t) => g.listStall(s.active, v.id, row.id, qty, price, t), `Listed ${amount(qty, row.id, row.name, row.lot)} at ${price} dr each.`);
              if (r.ok) setQty(1);
            }}
          >
            <label className="field">
              <span className="field__label">Good</span>
              <select id="stall-good" value={row?.id} onChange={(e) => setGood(e.target.value)}>
                {sellable.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · own {r.lot > 1 ? `${r.have} lot${r.have === 1 ? "" : "s"}` : r.have}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">How many</span>
              <Stepper id="stall-qty" label="How many to list" value={Math.min(qty, row?.have ?? 1)} min={1} max={Math.max(1, Math.min(row?.have ?? 1, view.maxQty))} onChange={setQty} />
            </label>
            <label className="field">
              <span className="field__label">Price each (dr)</span>
              <input id="stall-price" type="number" min={1} max={view.maxPrice} value={price} onChange={(e) => setPrice(Math.max(1, Math.min(view.maxPrice, Math.floor(Number(e.target.value) || 1))))} />
            </label>
            <div className="stall-form__go">
              {row && (
                <span className="muted small">
                  The agora pays {row.sell} dr · charges {row.buy} dr
                </span>
              )}
              <button className="btn btn--buy" type="submit" disabled={!enabled || full || !row}>
                List {qty} · {price} dr each
              </button>
              {full && <span className="note note--warn small">{view.stallCap} stalls is the most one house may keep.</span>}
            </div>
          </form>
        )}
      </section>
      <section className="subpanel">
        <h3 className="subpanel__title">Stalls</h3>
        {view.stalls.length === 0 ? (
          <p className="empty">No stalls yet.</p>
        ) : (
          <ul className="trade-list">
            {view.stalls.map((st) => (
              <StallRow key={st.id} id={st.id} enabled={enabled} />
            ))}
          </ul>
        )}
      </section>
      <p className="muted small">
        Tax: {pct(view.taxRate)} of each sale, paid by the seller.{" "}
        <button className="link small" onClick={() => nav.open({ kind: "market", tab: "goods" })}>
          Back to the agora's goods
        </button>
      </p>
    </>
  );
}

function StallRow({ id, enabled }: { id: string; enabled: boolean }) {
  const s = useSession();
  const now = s.now();
  const view = marketView(s.state, content, s.player, s.villageId, now);
  const st = view.stalls.find((x) => x.id === id);
  const [n, setN] = useState(1);
  if (!st) return null;
  const canAfford = Math.floor(s.player.purse / st.price);
  const max = Math.max(1, Math.min(st.remaining, canAfford));
  return (
    <li className="trade-row">
      <GoodIcon id={st.good} size={36} />
      <div className="trade-row__text">
        <div className="trade-row__name">
          {st.name} · {st.lot > 1 ? `${st.remaining} lot${st.remaining === 1 ? "" : "s"} of ${st.lot}` : st.remaining} at {st.price} dr
        </div>
        <div className="small muted">
          {st.sellerName}
          {st.houseName ? ` of ${st.houseName}` : ""}
        </div>
      </div>
      <div className="trade-row__act">
        {st.mine ? (
          <>
            <span className="tag">Your stall</span>
            <button className="btn btn--ghost btn--small" onClick={() => s.run((g, t) => g.cancelStall(s.active, st.id, t), `${amount(st.remaining, st.good, st.name, st.lot)} returned to your stores.`)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <Stepper id={`buy-${st.id}`} label={`${st.name} to buy`} value={Math.min(n, max)} min={1} max={max} onChange={setN} />
            <button className="btn btn--buy btn--small" disabled={!enabled || canAfford < 1} onClick={() => s.run((g, t) => g.buyStall(s.active, s.villageId, st.id, n, t), `Bought ${amount(n, st.good, st.name, st.lot)} for ${n * st.price} dr.`)}>
              Buy {n} · {n * st.price} dr
            </button>
          </>
        )}
      </div>
    </li>
  );
}
