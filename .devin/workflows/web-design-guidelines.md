---
description: Review UI code for Web Interface Guidelines compliance
---

# Web Design Guidelines

Use this slash command to review your UI code for compliance with Vercel's Web Interface Guidelines. The audit covers 100+ rules across accessibility, performance, and UX best practices.

## What it does

- Fetches the latest Web Interface Guidelines from Vercel
- Reviews specified files or entire codebase for compliance
- Checks accessibility, focus states, forms, animation, typography, images, performance, navigation, dark mode, touch interaction, and i18n
- Outputs findings in a clear, actionable format with file:line references

## When to use

- When you want to review UI components for accessibility compliance
- Before major releases to ensure quality standards
- When experiencing UX issues or inconsistencies
- To audit design patterns and best practices
- For comprehensive code quality assurance

## Usage

Type `/web-design-guidelines` in your chat to start the UI audit process.

The audit will:
1. Fetch the latest guidelines from Vercel's repository
2. Ask which files or patterns to review (optional - defaults to UI components)
3. Analyze code against all 100+ guidelines
4. Report findings with specific file locations and fix recommendations

## Categories covered

- **Accessibility**: aria-labels, semantic HTML, keyboard handlers
- **Focus States**: visible focus, focus-visible patterns
- **Forms**: autocomplete, validation, error handling
- **Animation**: prefers-reduced-motion, compositor-friendly transforms
- **Typography**: curly quotes, ellipsis, tabular-nums
- **Images**: dimensions, lazy loading, alt text
- **Performance**: virtualization, layout thrashing, preconnect
- **Navigation & State**: URL reflects state, deep-linking
- **Dark Mode & Theming**: color-scheme, theme-color meta
- **Touch & Interaction**: touch-action, tap-highlight
- **Locale & i18n**: Intl.DateTimeFormat, Intl.NumberFormat
