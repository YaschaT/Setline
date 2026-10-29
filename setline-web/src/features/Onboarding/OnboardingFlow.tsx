// OnboardingFlow.swift — what happens between making an account and the
// first session.
//
// Artboards 02a, 02b and 03–06, in the order the handoff sets out. A
// returning account never comes through here: the promise has been read, the
// questions have been answered, and the week is already waiting.
import { useState } from "react";
import { SL } from "../../design/tokens";
import { HowItWorksView, IntakeIntroView } from "./HowItWorksView";
import { IntakeFlow } from "./IntakeFlow";

type Stage = "howItWorks" | "intro" | "intake";

export function OnboardingFlow({ onFinish }: { onFinish: () => void }) {
  const [stage, setStage] = useState<Stage>("howItWorks");
  let content;
  switch (stage) {
    case "howItWorks":
      content = <HowItWorksView onContinue={() => setStage("intro")} />;
      break;
    case "intro":
      content = <IntakeIntroView onBack={() => setStage("howItWorks")} onBegin={() => setStage("intake")} onSkip={() => onFinish()} />;
      break;
    case "intake":
      content = <IntakeFlow onFinish={onFinish} />;
      break;
  }
  // `.animation(.easeOut(duration: SL.Motion.base), value: stage)`.
  return (
    <div key={stage} style={{ height: "100%", animation: `slRootFade ${SL.Motion.base}s ease-out` }}>
      {content}
    </div>
  );
}
