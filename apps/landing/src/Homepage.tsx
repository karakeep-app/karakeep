import ClosingCta from "./components/ClosingCta";
import LlmReady from "./components/LlmReady";
import OpenSource from "./components/OpenSource";
import Platforms from "./components/Platforms";
import UseCases from "./components/UseCases";

export default function Homepage() {
  return (
    <>
      <Platforms />
      <UseCases />
      <LlmReady />
      <OpenSource />
      <ClosingCta />
    </>
  );
}
