/**
 * Stub for react-native-svg/css.
 * react-native-qrcode-svg imports this only for optional logo-in-QR support.
 * We don't use logos in QR codes, so stubbing avoids the css-tree dependency.
 */
import React from 'react';
import { View } from 'react-native';

const Stub = () => null;

export const LocalSvg = Stub;
export const SvgCss = Stub;
export const SvgCssUri = Stub;
export const SvgWithCss = Stub;
export const SvgWithCssUri = Stub;
export const inlineStyles = () => {};
