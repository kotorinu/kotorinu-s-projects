"use client";
import { useState } from "react";
import { useWork } from "@/lib/work/client";
import StudioEditor from "./StudioEditor";
export default function StudioConnection() {
  const work = useWork(); const [login,setLogin]=useState(false);
  return <><div className="studio-connection"><span className={work.connected ? "connection-dot connected" : "connection-dot"} /><span>{work.connected ? "保存したデータを表示しています" : "接続前の参考表示です。最新の実績ではありません。"}</span>{!work.connected && <button type="button" onClick={()=>setLogin(true)}>接続する →</button>}</div>{login && <StudioEditor kind="login" onClose={()=>setLogin(false)} />}</>;
}
