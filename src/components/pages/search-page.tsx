"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { api, unwrap } from "@/lib/api";
import type { Category, Course, Material } from "@/lib/types";
import { ErrorMessage, LoadingModal, PageHeader } from "@/components/ui";
import { ModernSelect } from "@/components/modern-select";
import { useApiData } from "@/hooks/use-api-data";

export function SearchPage() {
  const [data, setData] = useState<{ courses: Course[]; materials: Material[] }>({ 
    courses: [], 
    materials: [] 
  });
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  
  const categories = useApiData<Category[] | { results: Category[] }>("/categories/");

  async function search(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setHasSearched(true);
    
    const form = new FormData(e.currentTarget);
    const params = new URLSearchParams({ q: String(form.get("q") || "") });
    
    if (form.get("category")) {
      params.set("category", String(form.get("category")));
    }
    
    try {
      setSearching(true);
      setData(await api(`/search/?${params}`));
    } catch (x) {
      setError(x instanceof Error ? x.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="space-y-6">
      <LoadingModal open={searching} title="Searching" message="Finding matching courses and materials." />
      <PageHeader 
        title="Search & Filtering" 
        description="Find courses, categories, and enrolled learning materials." 
      />
      
      {/* SEARCH FORM */}
      <form onSubmit={search} className="panel p-4 flex flex-col md:flex-row gap-3">
        <input 
          className="field flex-1 min-w-0" 
          name="q" 
          placeholder="Search courses and materials…" 
          autoFocus
        />
        
        <ModernSelect
          className="field md:max-w-xs"
          name="category"
          placeholder="All Categories"
          aria-label="Filter by category"
          options={categories.data ? unwrap(categories.data).map(c => ({ value: c.id, label: c.name })) : []}
        />
        
        <button className="btn btn-primary px-8 inline-flex items-center justify-center gap-2" disabled={searching}>
          {searching && <LoaderCircle className="animate-spin" size={18} aria-hidden="true" />}
          {searching ? "Searching..." : "Search"}
        </button>
      </form>
      
      {error && <ErrorMessage message={error} />}

      {/* SEARCH RESULTS */}
      <div className="grid lg:grid-cols-2 gap-6 items-start mt-8" aria-busy={searching}>
        {searching && (
          <div className="panel p-8 text-center lg:col-span-2" role="status" aria-live="polite">
            <LoaderCircle className="mx-auto animate-spin text-[var(--primary)]" size={32} aria-hidden="true" />
            <div className="mt-3 font-semibold">Searching...</div>
            <div className="muted mt-1 text-sm">Finding matching courses and materials.</div>
          </div>
        )}
        
        {/* COURSES COLUMN */}
        <section className={`panel p-0 overflow-hidden ${searching ? "opacity-60" : ""}`}>
          <div className="p-5 border-b border-[var(--border)] bg-[var(--background)]">
            <h2 className="font-bold text-lg flex items-center gap-2">
              Courses 
              <span className="badge">{data.courses.length}</span>
            </h2>
          </div>
          
          <div className="flex flex-col">
            {data.courses.length > 0 ? (
              data.courses.map(c => (
                <Link 
                  href={`/courses/${c.id}`} 
                  key={c.id}
                  className="block p-5 border-b border-[var(--border)] last:border-0 hover:bg-[var(--background)] transition-colors group"
                >
                  <strong className="block text-lg text-[var(--foreground)] group-hover:text-[var(--primary)] transition-colors">
                    {c.title}
                  </strong>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="badge">{c.course_code}</span>
                    <span className="badge">{c.category_detail?.name || "Uncategorized"}</span>
                  </div>
                  <div className="muted mt-2 line-clamp-2 text-sm">{c.description}</div>
                </Link>
              ))
            ) : hasSearched ? (
              <div className="p-8 text-center muted">No courses found matching your criteria.</div>
            ) : (
              <div className="p-8 text-center muted text-sm">Enter a query to search courses.</div>
            )}
          </div>
        </section>

        {/* MATERIALS COLUMN */}
        <section className={`panel p-0 overflow-hidden ${searching ? "opacity-60" : ""}`}>
          <div className="p-5 border-b border-[var(--border)] bg-[var(--background)]">
            <h2 className="font-bold text-lg flex items-center gap-2">
              Learning Materials
              <span className="badge">{data.materials.length}</span>
            </h2>
          </div>
          
          <div className="flex flex-col">
            {data.materials.length > 0 ? (
              data.materials.map(m => (
                <div className="p-5 border-b border-[var(--border)] last:border-0 flex flex-wrap items-center justify-between gap-4" key={m.id}>
                  <div>
                    <strong className="block text-lg text-[var(--foreground)]">{m.title}</strong>
                    <div className="muted mt-1 text-sm font-medium">{m.material_type}</div>
                  </div>
                  
                  {m.download_url && (
                    <a 
                      href={m.download_url} 
                      className="btn btn-secondary text-sm px-4 py-1.5"
                      download
                    >
                      Download
                    </a>
                  )}
                </div>
              ))
            ) : hasSearched ? (
              <div className="p-8 text-center muted">No materials found matching your criteria.</div>
            ) : (
              <div className="p-8 text-center muted text-sm">Enter a query to search materials.</div>
            )}
          </div>
        </section>

      </div>
    </div>
  );
}
