---
description: Generate, extend, or validate design tokens and color systems
---

# Design Tokens

Generate, extend, or validate DTCG-format design tokens with a 3-tier architecture (Primitive → Semantic → Component). Use this slash command to create comprehensive design systems, color palettes, typography scales, spacing systems, and multi-brand theming.

## What it does

- Generates DTCG-format JSON tokens for colors, typography, spacing, shadows, borders, breakpoints, motion
- Creates a 3-tier architecture: Primitive (raw values) → Semantic (named tokens) → Component (specific use cases)
- Validates existing token systems for consistency and accessibility
- Supports multi-brand theming and design system mapping
- Includes accessibility specs and contrast validation

## When to use

- When creating a new design system or visual language
- To standardize colors, typography, and spacing across your app
- When adding support for dark mode or multiple themes
- For accessibility compliance and contrast checking
- When migrating between design systems (Material, Apple HIG, shadcn, etc.)
- To create component-specific token variants

## Usage

Type `/design-tokens` in your chat to start the design token generation process.

The system will:
1. Analyze your current design patterns and brand requirements
2. Generate primitive tokens (base colors, fonts, spacing)
3. Create semantic tokens (primary, secondary, background, text)
4. Build component-specific tokens (button sizes, card padding, etc.)
5. Validate for accessibility and contrast ratios
6. Output ready-to-use token files and CSS variables

## Output includes

- **tokens.json** - Complete DTCG format token system
- **CSS variables** - Ready-to-use CSS custom properties
- **Accessibility report** - Contrast ratios and compliance status
- **Theme variants** - Light/dark mode and brand variations
- **Implementation guide** - How to use tokens in your components

Perfect for creating a consistent, accessible, and maintainable design system for your finance tracker.
