// src/components/PublicLayout.js
import React from "react";
import { Outlet } from "react-router-dom";

const PublicLayout = () => (
  <div className="public-layout">
    <Outlet />
  </div>
);

export default PublicLayout;
