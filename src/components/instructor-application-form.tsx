"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { api, jsonBody } from "@/lib/api";
import { BrandLogo } from "./brand-logo";

type Application = { reference:string; full_name:string; status:string; admin_note:string; created_at:string; reviewed_at?:string|null };

export function InstructorApplicationForm({ statusMode=false }: { statusMode?:boolean }) {
  const [result,setResult]=useState<Application|null>(null); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError("");const values=Object.fromEntries(new FormData(e.currentTarget));try{const data=statusMode?await api<Application>(`/instructor-applications/${values.reference}/?email=${encodeURIComponent(String(values.email))}`):await api<Application>("/instructor-applications/",{method:"POST",body:jsonBody(values)});setResult(data);}catch(x){setError(x instanceof Error?x.message:"Request failed");}finally{setBusy(false)}}
  return <main className="min-h-screen grid place-items-center p-5"><section className="panel w-full max-w-2xl p-8"><BrandLogo/><h1 className="text-2xl font-bold mt-5">{statusMode?"Check Instructor Application":"Teacher Application Form"}</h1>
    {result?<div className="mt-6 space-y-3"><span className="badge">{result.status}</span><p><strong>Reference:</strong> {result.reference}</p><p><strong>Applicant:</strong> {result.full_name}</p>{result.admin_note&&<p><strong>Admin note:</strong> {result.admin_note}</p>}<Link className="btn btn-secondary" href="/login">Back to login</Link></div>:
    <form className="mt-6 grid gap-4" onSubmit={submit}>{statusMode?<><input className="field" name="reference" placeholder="Application reference" required/><input className="field" name="email" type="email" placeholder="Email" required/></>:<><input className="field" name="full_name" placeholder="Full name" required/><input className="field" name="email" type="email" placeholder="Email address" required/><input className="field" name="phone" placeholder="Phone number" required/><input className="field" name="bachelor_degree" placeholder="Bachelor's degree" required/><input className="field" name="master_degree" placeholder="Master's degree (optional)"/><input className="field" name="years_experience" type="number" min="0" placeholder="Years of experience (optional)"/><textarea className="field" name="expertise" placeholder="Expertise / skills (optional)"/><textarea className="field" name="teaching_background" placeholder="Institution/organization, designation, and teaching/work experience" required/></>}{error&&<div className="error">{error}</div>}<button className="btn btn-primary" disabled={busy}>{busy?"Please wait…":statusMode?"Check status":"Submit application"}</button><Link href="/login">Back to login</Link></form>}
  </section></main>;
}
