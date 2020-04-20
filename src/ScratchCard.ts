import {SC_CONFIG} from './ScratchCardConfig';
import {SCRATCH_TYPE} from './ScratchCardConfig';
import { loadImage, throttle, dispatchCustomEvent, injectHTML, getOffset } from './utils'
import Brush from './Brush';

class ScratchCard {
  readonly config: SC_CONFIG;
  private position: number[];
  readonly scratchType: SCRATCH_TYPE;
  public brushImage: any;
  readonly ctx: CanvasRenderingContext2D;
  readonly container: HTMLElement;
  private defaults: SC_CONFIG;
  private scratchImage: HTMLImageElement;
  public zone: {top: number, left: number};
  private canvas: HTMLCanvasElement;
  private readyToClear: Boolean;
  private brush: Brush;
  private callbackDone: Boolean;
  private playedStartSound: Boolean;
  public percent: number;

  constructor (selector: string, config: SC_CONFIG) {
    const self = this;
    const defaults = {
      scratchType: SCRATCH_TYPE.SPRAY,
      containerWidth: 100,
      containerHeight: 100,
      percentToFinish: 50,
      nPoints: 100,
      pointSize: [10, 10],
      callback: function() {
          alert('done.')
      },
      brushSrc: '',
      imageForwardSrc: './images/scratchcard.png',
      imageBackgroundSrc: './images/scratchcard-background.svg',
      htmlBackground: '',
      clearZoneRadius: 0,
      enabledPercentUpdate: true,
      soundScratchBegin: HTMLAudioElement,
      soundScratchMid: HTMLAudioElement,
      soundScratchEnd: HTMLAudioElement,
    };

    this.config = {...defaults, ...config};
    this.scratchType = this.config.scratchType;
    this.container = <HTMLElement> document.querySelector(selector);
    this.position = [0, 0]; // init position
    this.readyToClear = false;
    this.percent = 0;
    this.callbackDone = false;

    // Create and add the canvas
    this.generateCanvas();

    this.ctx = this.canvas.getContext('2d');

    // Init the brush instance
    this.brush = new Brush(this.ctx, this.position[0], this.position[1]);

    // Init the brush if  necessary
    if (this.config.scratchType === SCRATCH_TYPE.BRUSH) {
      loadImage(this.config.brushSrc).then(image => {
        this.brushImage = image;
      });
    }

    /*---- Scratching method , call in throttle event ------------------------------------*/
    let scratching = throttle((event: Event) => {
      let sound;
      event.preventDefault();
      if (!this.playedStartSound) {
        sound = this.config.soundScratchBegin;
        sound.play();
        this.playedStartSound = true;
      }
      sound = this.config.soundScratchMid;
      sound.play();
      self.dispatchEvent('scratch', 'move');
      self.position = self.mousePosition(event);
      self.brush.updateMousePosition(self.position[0], self.position[1]);
      self.scratch();

      // calculate the percent of area scratched.
      if (this.config.enabledPercentUpdate) {
        self.percent = self.updatePercent();
      }
    }, 16);

    /*---- Events -----------------------------------------------------------------------*/
    this.canvas.addEventListener('mousedown', function (event) {
      event.preventDefault();
      self._setScratchPosition();
      self.canvas.addEventListener('mousemove', scratching);
      document.body.addEventListener('mouseup', function _func () {
        self.canvas.removeEventListener('mousemove', scratching);
        self.finish(); // clear and callback
        this.removeEventListener('mouseup', _func);
        self.playedStartSound = false;
        let sound = self.config.soundScratchEnd;
        sound.play();
      });
    });

    // Mobile events
    this.canvas.addEventListener('touchstart', function (event) {
      event.preventDefault();
      self._setScratchPosition();
      self.canvas.addEventListener('touchmove', scratching);
      document.body.addEventListener('touchend', function _func () {
        self.canvas.removeEventListener('touchmove', scratching);
        self.finish(); // clear and callback
        this.removeEventListener('touchend', _func);
      });
    });

    // Update canvas positions when the window has been resized
    window.addEventListener('resize', throttle(() => {
      this._setScratchPosition();
    }, 100));

    // Update canvas positions when the window has been scrolled
    window.addEventListener('scroll', throttle(() => {
      this._setScratchPosition();
    }, 16));
  }

  /**
   * Get percent of scratchCard
   * @returns {number}
   */
  getPercent (): number {
    return this.percent;
  }

  /**
   * Return the top and left position
   * @private
   */
  private _setScratchPosition () {
    this.zone = getOffset(this.canvas);
    console.log(this.zone);
  }

  finish () {
    // Exec the callback once
    if (!this.callbackDone && this.percent > this.config.percentToFinish) {
      this.clear();
      this.canvas.style.pointerEvents = 'none';
      if (this.config.callback !== undefined) {
        this.callbackDone = true;
        this.config.callback();
      }
    }
  }

  /**
   * Distpach event
   * @param {string} phase
   * @param {string} type
   */
  dispatchEvent (phase: string, type: string) {
    dispatchCustomEvent(this.canvas, `${phase}.${type}`, {});
  }

  init (): Promise<any> {
    return new Promise((resolve: any, reject: any) => {
      loadImage(this.config.imageForwardSrc).then((img: HTMLImageElement) => {
        this.scratchImage = img;
        this.ctx.drawImage(this.scratchImage, 0, 0, this.canvas.width, this.canvas.height);
        this.setBackground();
        // Resolve the promise init
        resolve();
      }, (event: Event): Error => {
        // Reject init
        reject(event);
        return new TypeError(`${this.config.imageForwardSrc} is not loaded.`);
      });
    });
  }

  private generateCanvas (): void {
    this.canvas = document.createElement('canvas');
    this.canvas.classList.add('sc__canvas');

    // Add canvas into container
    this.canvas.width = this.config.containerWidth;
    this.canvas.height = this.config.containerHeight;
    this.container.appendChild(this.canvas);
  }

  private setBackground (): void {
    if (this.config.htmlBackground.length !== 0) {
      injectHTML(this.config.htmlBackground, this.container);
    } else {
      let image = document.createElement('img');
      loadImage(this.config.imageBackgroundSrc).then((img: HTMLImageElement) => {
        image.src = img.src;
        this.container.insertBefore(image, this.canvas);
      }, (error: Error) => {
        // Stop all script here
        console.log(error.message);
      });
    }
  };

  mousePosition (event: any): number[] {
    let posX: number;
    let posY: number;

    switch (event.type) {
      case 'touchmove':
        posX = event.touches[0].clientX - this.config.clearZoneRadius - this.zone.left;
        posY = event.touches[0].clientY - this.config.clearZoneRadius - this.zone.top;
        break;
      case 'mousemove':
        posX = event.clientX - this.config.clearZoneRadius - this.zone.left;
        posY = event.clientY - this.config.clearZoneRadius - this.zone.top;
        break;
    }

    return [posX, posY];
  }

  scratch (): void {
    let x = this.position[0];
    let y = this.position[1];
    let i = 0;

    this.ctx.globalCompositeOperation = 'destination-out';
    this.ctx.save();

    // Choose the good method to 'paint'
    switch (this.config.scratchType) {
      case SCRATCH_TYPE.BRUSH:
        this.brush.brush(this.brushImage);
        break;
      case SCRATCH_TYPE.CIRCLE:
        this.brush.circle(this.config.clearZoneRadius);
        break;
      case SCRATCH_TYPE.SPRAY:
        this.brush.spray(this.config.clearZoneRadius, this.config.pointSize,  this.config.nPoints);
        break;
    }

    this.ctx.restore();
  }

  /*
  * Image data :
  * Red: image.data[0]
  * Green: image.data[1]
  * Blue: image.data[2]
  * Alpha: image.data[3]
  * */
  updatePercent (): number {
    let counter = 0; // number of pixels cleared
    let imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    let imageDataLength = imageData.data.length;

    // loop data image drop every 4 items [r, g, b, a, ...]
    for(let i = 0; i < imageDataLength; i += 4) {
      // Increment the counter only if the pixel in completely clear
      if (imageData.data[i] === 0 && imageData.data[i+1] === 0 && imageData.data[i+2] === 0 && imageData.data[i+3] === 0) {
        counter++;
      }
    }

    return (counter >= 1) ? (counter / (this.canvas.width * this.canvas.height)) * 100 : 0;
  }

  /**
   * Just clear the canvas
   */
  clear (): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

}

// Expose directly in window, any ideas to do this better.
(<any>window).ScratchCard = ScratchCard;
(<any>window).SCRATCH_TYPE = SCRATCH_TYPE;

export {ScratchCard, SCRATCH_TYPE};
