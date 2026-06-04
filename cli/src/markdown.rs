use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span, Text};

pub fn parse_markdown(content: &str) -> Text<'static> {
    let mut lines = Vec::new();
    let mut in_code_block = false;

    // Palette alignment with workbench index.css
    let primary_text_color = Color::Rgb(240, 243, 248);     // HSL 210, 40%, 98%
    let secondary_text_color = Color::Rgb(148, 161, 178);   // HSL 215, 20%, 65%
    let accent_color = Color::Rgb(59, 130, 246);           // HSL 217, 91%, 60%
    let code_color = Color::Rgb(251, 191, 36);             // Amber code color
    let border_color = Color::Rgb(30, 41, 59);

    for raw_line in content.lines() {
        let trimmed = raw_line.trim();

        // 1. Code Block Toggle
        if trimmed.starts_with("```") {
            in_code_block = !in_code_block;
            lines.push(Line::from(vec![
                Span::styled(raw_line.to_string(), Style::default().fg(Color::Rgb(100, 116, 139)))
            ]));
            continue;
        }

        if in_code_block {
            lines.push(Line::from(vec![
                Span::styled(raw_line.to_string(), Style::default().fg(code_color))
            ]));
            continue;
        }

        // 2. Headers
        if trimmed.starts_with("# ") {
            let title = &trimmed[2..];
            lines.push(Line::from(vec![
                Span::styled("# ", Style::default().fg(accent_color).add_modifier(Modifier::BOLD)),
                Span::styled(title.to_string(), Style::default().fg(primary_text_color).add_modifier(Modifier::BOLD)),
            ]));
            lines.push(Line::from(vec![
                Span::styled("─".repeat(title.len() + 2), Style::default().fg(border_color))
            ]));
            continue;
        } else if trimmed.starts_with("## ") {
            lines.push(Line::from(vec![
                Span::styled("## ", Style::default().fg(Color::Rgb(96, 165, 250)).add_modifier(Modifier::BOLD)),
                Span::styled((&trimmed[3..]).to_string(), Style::default().fg(primary_text_color).add_modifier(Modifier::BOLD)),
            ]));
            continue;
        } else if trimmed.starts_with("### ") {
            lines.push(Line::from(vec![
                Span::styled("### ", Style::default().fg(Color::Rgb(147, 197, 253)).add_modifier(Modifier::BOLD)),
                Span::styled((&trimmed[4..]).to_string(), Style::default().fg(primary_text_color).add_modifier(Modifier::BOLD)),
            ]));
            continue;
        } else if trimmed.starts_with("#### ") {
            lines.push(Line::from(vec![
                Span::styled("#### ", Style::default().fg(Color::Rgb(191, 219, 254)).add_modifier(Modifier::BOLD)),
                Span::styled((&trimmed[5..]).to_string(), Style::default().fg(primary_text_color).add_modifier(Modifier::BOLD)),
            ]));
            continue;
        }

        // 3. Blockquotes
        if trimmed.starts_with(">") {
            let quote_text = if trimmed.len() > 1 {
                if trimmed.as_bytes()[1] == b' ' {
                    &trimmed[2..]
                } else {
                    &trimmed[1..]
                }
            } else {
                ""
            };
            lines.push(Line::from(vec![
                Span::styled("│ ", Style::default().fg(accent_color).add_modifier(Modifier::BOLD)),
                Span::styled(quote_text.to_string(), Style::default().fg(secondary_text_color).add_modifier(Modifier::ITALIC)),
            ]));
            continue;
        }

        // 4. Tasks and standard lists
        if trimmed.starts_with("- [ ] ") || trimmed.starts_with("* [ ] ") {
            let text = &trimmed[6..];
            lines.push(Line::from(vec![
                Span::styled("☐ ", Style::default().fg(accent_color)),
                Span::styled(text.to_string(), Style::default().fg(primary_text_color)),
            ]));
            continue;
        } else if trimmed.starts_with("- [x] ") || trimmed.starts_with("* [x] ") {
            let text = &trimmed[6..];
            lines.push(Line::from(vec![
                Span::styled("☑ ", Style::default().fg(secondary_text_color)),
                Span::styled(text.to_string(), Style::default().fg(secondary_text_color).add_modifier(Modifier::CROSSED_OUT)),
            ]));
            continue;
        } else if trimmed.starts_with("- ") || trimmed.starts_with("* ") {
            let text = &trimmed[2..];
            lines.push(Line::from(vec![
                Span::styled("• ", Style::default().fg(accent_color)),
                Span::styled(text.to_string(), Style::default().fg(primary_text_color)),
            ]));
            continue;
        }

        // 5. Standard line
        let spans = parse_inline(raw_line, primary_text_color, code_color);
        lines.push(Line::from(spans));
    }

    Text::from(lines)
}

fn parse_inline(line: &str, text_color: Color, code_color: Color) -> Vec<Span<'static>> {
    let mut spans = Vec::new();
    let mut current_idx = 0;

    while current_idx < line.len() {
        let next_tick = line[current_idx..].find('`');
        let next_bold = line[current_idx..].find("**");

        match (next_tick, next_bold) {
            (Some(tick_idx), Some(bold_idx)) if tick_idx < bold_idx => {
                // Inline code is first
                let real_tick_idx = current_idx + tick_idx;
                if real_tick_idx > current_idx {
                    spans.push(Span::styled(line[current_idx..real_tick_idx].to_string(), Style::default().fg(text_color)));
                }
                if let Some(close_idx) = line[real_tick_idx + 1..].find('`') {
                    let real_close_idx = real_tick_idx + 1 + close_idx;
                    let code_text = &line[real_tick_idx + 1..real_close_idx];
                    spans.push(Span::styled(
                        format!(" {} ", code_text),
                        Style::default().fg(code_color).bg(Color::Rgb(30, 41, 59))
                    ));
                    current_idx = real_close_idx + 1;
                } else {
                    spans.push(Span::styled(line[real_tick_idx..real_tick_idx + 1].to_string(), Style::default().fg(text_color)));
                    current_idx = real_tick_idx + 1;
                }
            }
            (_, Some(bold_idx)) => {
                // Bold is first
                let real_bold_idx = current_idx + bold_idx;
                if real_bold_idx > current_idx {
                    spans.push(Span::styled(line[current_idx..real_bold_idx].to_string(), Style::default().fg(text_color)));
                }
                if let Some(close_idx) = line[real_bold_idx + 2..].find("**") {
                    let real_close_idx = real_bold_idx + 2 + close_idx;
                    let bold_text = &line[real_bold_idx + 2..real_close_idx];
                    spans.push(Span::styled(
                        bold_text.to_string(),
                        Style::default().fg(text_color).add_modifier(Modifier::BOLD)
                    ));
                    current_idx = real_close_idx + 2;
                } else {
                    spans.push(Span::styled(line[real_bold_idx..real_bold_idx + 2].to_string(), Style::default().fg(text_color)));
                    current_idx = real_bold_idx + 2;
                }
            }
            (Some(tick_idx), None) => {
                // Inline code is first
                let real_tick_idx = current_idx + tick_idx;
                if real_tick_idx > current_idx {
                    spans.push(Span::styled(line[current_idx..real_tick_idx].to_string(), Style::default().fg(text_color)));
                }
                if let Some(close_idx) = line[real_tick_idx + 1..].find('`') {
                    let real_close_idx = real_tick_idx + 1 + close_idx;
                    let code_text = &line[real_tick_idx + 1..real_close_idx];
                    spans.push(Span::styled(
                        format!(" {} ", code_text),
                        Style::default().fg(code_color).bg(Color::Rgb(30, 41, 59))
                    ));
                    current_idx = real_close_idx + 1;
                } else {
                    spans.push(Span::styled(line[real_tick_idx..real_tick_idx + 1].to_string(), Style::default().fg(text_color)));
                    current_idx = real_tick_idx + 1;
                }
            }
            (None, None) => {
                spans.push(Span::styled(line[current_idx..].to_string(), Style::default().fg(text_color)));
                break;
            }
        }
    }
    spans
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_headers() {
        let content = "# My Heading\nSome text";
        let parsed = parse_markdown(content);
        assert_eq!(parsed.lines.len(), 3); // Heading line, line separator, text line
    }

    #[test]
    fn test_lists_and_tasks() {
        let content = "- [ ] Unfinished task\n- [x] Finished task\n- Normal item";
        let parsed = parse_markdown(content);
        assert_eq!(parsed.lines.len(), 3);
        
        assert!(parsed.lines[0].to_string().contains("☐"));
        assert!(parsed.lines[1].to_string().contains("☑"));
        assert!(parsed.lines[2].to_string().contains("•"));
    }

    #[test]
    fn test_inline_formatting() {
        let spans = parse_inline("Normal text with `code` and **bold**", Color::White, Color::Yellow);
        assert_eq!(spans.len(), 4);
        assert_eq!(spans[0].content, "Normal text with ");
        assert_eq!(spans[1].content, " code ");
        assert_eq!(spans[2].content, " and ");
        assert_eq!(spans[3].content, "bold");
    }
}

