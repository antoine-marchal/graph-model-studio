"use strict";

const assert = require('node:assert/strict');
const test = require('node:test');
const { patchStyles } = require('../integrations/markdown-toolkit/source/docx');

const styles = '<w:styles><w:style w:type="paragraph" w:styleId="BodyText"></w:style>'
    + '<w:style w:type="table" w:default="1" w:styleId="Table"><w:tblPr><w:tblInd/></w:tblPr>'
    + '<w:tblStylePr w:type="firstRow"><w:tcPr><w:vAlign/></w:tcPr></w:tblStylePr></w:style></w:styles>';

test('the DOCX reference gets the styles the Lua filter uses', () => {
    const patched = patchStyles(styles, true);
    for (const id of ['Columns', 'Center', 'Right', 'HighlightYellow', 'HighlightRed']) {
        assert.match(patched, new RegExp(`w:styleId="${id}"`));
    }
    assert.match(patched, /w:styleId="Center">[\s\S]*?<w:basedOn w:val="BodyText"\/>[\s\S]*?<w:jc w:val="center"\/>/);
    assert.match(patched, /w:styleId="Table"[^>]*><w:tblPr><w:tblBorders>/);
});

test('a user template keeps its own table style and existing styles', () => {
    const custom = styles.replace('</w:styles>', '<w:style w:type="paragraph" w:styleId="Center"><mine/></w:style></w:styles>');
    const patched = patchStyles(custom, false);
    assert.equal(patched.match(/w:styleId="Center"/g).length, 1);
    assert.doesNotMatch(patched, /w:tblBorders><w:top w:val="single"/);
});
