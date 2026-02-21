import Apps from "@/src/Apps";
import Homepage from "@/src/Homepage";
import Pricing from "@/src/Pricing";
import Privacy from "@/src/Privacy";
import Terms from "@/src/Terms";
import { BrowserRouter, Route, Routes } from "react-router";

import "@karakeep/tailwind-config/globals.css";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Homepage />} />
        <Route path="/apps" element={<Apps />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
      </Routes>
    </BrowserRouter>
  );
}
