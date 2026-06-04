BIN=../bin/ocr
$(BIN): ocr.swift
	mkdir -p ../bin
	swiftc -O -o $(BIN) ocr.swift
clean:
	rm -f $(BIN)
