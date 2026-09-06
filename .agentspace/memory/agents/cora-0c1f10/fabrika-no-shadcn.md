---
name: fabrika-no-shadcn
description: Fabrika codebase does not have shadcn/ui components installed — use inline HTML with Tailwind for UI
metadata:
  type: reference
---

## UI Library Status

**Fabrika does NOT have shadcn/ui** (Button, Card, Table, Slider, etc.).

**Checked:**
- `src/components/ui/` directory does NOT exist
- No imports of `@/components/ui/button`, etc. in codebase

**Solution:** Write UI with **native HTML + Tailwind**:

```tsx
// ❌ Won't work
import { Button } from '@/components/ui/button';

// ✅ Do this
<button className="bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700">
  Submit
</button>
```

### Common Elements

**Button:**
```tsx
<button className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50">
  {label}
</button>
```

**Card/Container:**
```tsx
<div className="border border-gray-200 rounded-lg p-6 bg-white">
  {children}
</div>
```

**Slider (range input):**
```tsx
<input
  type="range"
  min="1"
  max="5"
  step="1"
  value={value}
  onChange={(e) => setValue(Number(e.target.value))}
  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
/>
```

**Table:**
```tsx
<table className="w-full text-sm">
  <thead>
    <tr className="border-b">
      <th className="text-left py-2 px-4 font-semibold">Header</th>
    </tr>
  </thead>
  <tbody>
    <tr className="border-b hover:bg-gray-50">
      <td className="py-2 px-4">{value}</td>
    </tr>
  </tbody>
</table>
```

### Installation Note

If future projects need shadcn/ui:
```bash
npx shadcn-ui@latest init
npx shadcn-ui@latest add button card table slider
```

But **for now:** inline styles work fine for minimal scope components.

---

## Related

- M6 Form/Dashboard components (cora-0c1f10, 2026-09-06)
