import express from 'express';
import { isOdd } from '@camagru/common';

const app = express();

app.listen(1234, async () => {
  console.log('is odd', isOdd(23));
  console.log('i change something, it gets recompiled, youpi');
});
