"use client";

/**
 * The living backdrop for the gate surfaces.
 *
 * A training week is the product's core object: every real date is either a
 * workout or a rest day. The gate shows that object at rest while nobody is
 * signed in, then fills it in as first-run setup answers land — so the last
 * step of onboarding hands over the actual first week rather than a promise
 * of one.
 */

export type WeekSlot = {
  /** Two-letter Dutch day label. */
  label: string;
  /** Short training name ("PUSH", "PULL"), or null for a rest day. */
  training: string | null;
  /** False while this slot is still unanswered and stays at rest. */
  decided: boolean;
};

export const DAY_LABELS = ["ma", "di", "wo", "do", "vr", "za", "zo"] as const;

export const RESTING_WEEK: WeekSlot[] = DAY_LABELS.map((label) => ({
  label,
  training: null,
  decided: false,
}));

export function WeekCanvas({
  slots,
  igniting = false,
}: {
  slots: WeekSlot[];
  /** The single authored moment: the week lights up as the gate hands over. */
  igniting?: boolean;
}) {
  return (
    <div
      className={`week-canvas ${igniting ? "week-canvas-igniting" : ""}`}
      aria-hidden="true"
    >
      {slots.map((slot, index) => (
        <div
          key={slot.label}
          className={`week-canvas-slot ${slot.decided ? "is-decided" : ""} ${
            slot.decided && slot.training ? "is-training" : ""
          }`}
          style={{ "--slot-index": index } as React.CSSProperties}
        >
          <span className="week-canvas-day">{slot.label}</span>
          <span className="week-canvas-training">{slot.training ?? ""}</span>
          <div className="week-canvas-column">
            <span className="week-canvas-fill" />
          </div>
        </div>
      ))}
    </div>
  );
}
