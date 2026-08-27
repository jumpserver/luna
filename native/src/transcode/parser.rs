/// Guacamole protocol instruction parser (zero-copy).
///
/// The Guacamole protocol uses length-prefixed elements:
/// `length.value,length.value,...;`
///
/// Example: `4.size,2.-1,2.11,2.16;`
/// - opcode: "size"
/// - args: ["-1", "11", "16"]
///
/// All string values borrow from the input slice — no heap allocation per element.

#[derive(Debug, Clone)]
pub struct Instruction<'a> {
    pub opcode: &'a str,
    pub args: Vec<&'a str>,
}

pub struct Parser<'a> {
    data: &'a [u8],
    pos: usize,
}

impl<'a> Parser<'a> {
    pub fn new(data: &'a [u8]) -> Self {
        Self { data, pos: 0 }
    }

    pub fn current_offset(&self) -> usize {
        self.pos
    }

    fn remaining(&self) -> bool {
        self.pos < self.data.len()
    }

    fn skip_whitespace(&mut self) {
        while self.pos < self.data.len()
            && (self.data[self.pos] == b'\n' || self.data[self.pos] == b'\r')
        {
            self.pos += 1;
        }
    }

    /// Parse a length-prefixed element: `digits.content`
    /// Returns a borrowed `&str` slice — no allocation.
    fn parse_element(&mut self) -> Option<&'a str> {
        self.skip_whitespace();

        if !self.remaining() {
            return None;
        }

        let len_start = self.pos;
        while self.pos < self.data.len() && self.data[self.pos].is_ascii_digit() {
            self.pos += 1;
        }

        if self.pos == len_start || self.pos >= self.data.len() || self.data[self.pos] != b'.' {
            return None;
        }

        let len_str = std::str::from_utf8(&self.data[len_start..self.pos]).ok()?;
        let len: usize = len_str.parse().ok()?;

        self.pos += 1; // skip '.'

        if self.pos + len > self.data.len() {
            return None;
        }

        let value = std::str::from_utf8(&self.data[self.pos..self.pos + len]).ok()?;
        self.pos += len;

        Some(value)
    }

    /// Parse the next complete instruction (opcode + args), terminated by ';'.
    pub fn next_instruction(&mut self) -> Option<Instruction<'a>> {
        self.skip_whitespace();

        if !self.remaining() {
            return None;
        }

        let opcode = self.parse_element()?;
        let mut args = Vec::new();

        loop {
            if !self.remaining() {
                break;
            }

            match self.data[self.pos] {
                b',' => {
                    self.pos += 1;
                    if let Some(arg) = self.parse_element() {
                        args.push(arg);
                    }
                }
                b';' => {
                    self.pos += 1;
                    break;
                }
                _ => break,
            }
        }

        Some(Instruction { opcode, args })
    }
}
