use std::error::Error;
use std::fmt::{self, Display, Formatter};

use crate::model::Sample;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParseErrorKind {
    MissingComma,
    EmptyJoint,
    InvalidPosition(String),
    NonFinitePosition,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseError {
    pub line: usize,
    pub kind: ParseErrorKind,
}

impl Display for ParseError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> fmt::Result {
        write!(formatter, "line {}: ", self.line)?;

        match &self.kind {
            ParseErrorKind::MissingComma => write!(formatter, "expected `joint,position_rad`"),
            ParseErrorKind::EmptyJoint => write!(formatter, "joint name cannot be empty"),
            ParseErrorKind::InvalidPosition(raw) => {
                write!(formatter, "`{raw}` is not a valid floating-point value")
            }
            ParseErrorKind::NonFinitePosition => {
                write!(formatter, "position must be finite")
            }
        }
    }
}

impl Error for ParseError {}

pub fn parse_samples(input: &str) -> Result<Vec<Sample>, ParseError> {
    input
        .lines()
        .enumerate()
        .filter_map(|(index, raw_line)| {
            let line = raw_line.trim();
            (!line.is_empty() && !line.starts_with('#')).then_some((index + 1, line))
        })
        .map(|(line_number, line)| parse_line(line_number, line))
        .collect()
}

fn parse_line(line_number: usize, line: &str) -> Result<Sample, ParseError> {
    let (joint, raw_position) = line.split_once(',').ok_or(ParseError {
        line: line_number,
        kind: ParseErrorKind::MissingComma,
    })?;

    let joint = joint.trim();
    if joint.is_empty() {
        return Err(ParseError {
            line: line_number,
            kind: ParseErrorKind::EmptyJoint,
        });
    }

    let raw_position = raw_position.trim();
    let position_rad = raw_position.parse::<f64>().map_err(|_| ParseError {
        line: line_number,
        kind: ParseErrorKind::InvalidPosition(raw_position.to_owned()),
    })?;

    if !position_rad.is_finite() {
        return Err(ParseError {
            line: line_number,
            kind: ParseErrorKind::NonFinitePosition,
        });
    }

    Ok(Sample::new(joint, position_rad))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_the_physical_source_line() {
        let input = "# comment\n\nfront_left_hip,not-a-number\n";
        let error = parse_samples(input).expect_err("the position is invalid");

        assert_eq!(error.line, 3);
        assert_eq!(
            error.kind,
            ParseErrorKind::InvalidPosition("not-a-number".to_owned())
        );
    }
}
