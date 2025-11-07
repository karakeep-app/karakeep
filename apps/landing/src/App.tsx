import Homepage from "@/src/Homepage";
import Pricing from "@/src/Pricing";
import Privacy from "@/src/Privacy";
import { BrowserRouter, Route, Routes } from "react-router";

import "@karakeep/tailwind-config/globals.css";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Homepage />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/privacy" element={<Privacy />} />
      </Routes>
    </BrowserRouter>
  );
}
