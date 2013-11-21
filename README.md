simpleDeclare
=============

This is a Dojo-inspired implementation of `declare()`, which will help you create Javascript classes^H^H^H^H^H^Hconstructor functions while keeping you code clean and neat.

simpleDeclare in short supports:

* multiple inheritance; this allows the creation of "Mixin" classes;
* definition of constractor functions (they will be called automatically, in the right order);
* ability to call inherited methods within a method (async and normal ones);
* inheriting from "normal" Javascript constructor functions/classes;
* inheritance of class-wide methods.

The class is fully unit-tested and it's being used in [Hotplate](https://github.com/mercmobily/hotplate) as most of Hotplate's foundation modules.

## Guide

Here is a code snipset that shows 100% of SimpleDeclare's features:


    var declare = require('simpledeclare');

    // Create a BaseClass with a constructor, a method and a class method
    var BaseClass = declare( null, {

      // Define the constructor, will initialise `a`
      constructor: function( a ){

        console.log("BaseClass' constructor run");
        this.a = a; 
      },

      // Define a simple method, that will assign `b` and return 1000
      assignB: function( b ){
        this.b = b;
        return 1000;
      },

      // Define an async method, which takes two parameters and
      // calls the callback with the sum of the values
      asyncMethod: function( p1, p2, done ){
        var t = p1 + p2;

        console.log("Original result of asyncMethod: " + t );

        done( null, t );
      },

    });

    // Defines a class method
    BaseClass.classMethod = function(){ 
      console.log("Class method actualy run");
    }


    // Create a DerivedClass derived from BaseClass. It overloads the constructor
    // incrementing `a`. It also defines assignD()

    var DerivedClass = declare( BaseClass, {

      // Define the constructor. Note that this will be called _after_ BaseClass' constructor
      constructor: function( a ){

        console.log("DerivedClass' constructor run");
        this.a ++;
      },

      // Define a new method to define `d`
      assignD: function( d ){
        this.d = d;
      },

      // Redefine BaseClass' `asyncMethod()` so that it considers `p1` twice
      // in the sum. To call the inherited async method, it uses `this.inheritedAsync()`
      asyncMethod: function( p1, p2, done ){
        this.inheritedAsync( 'asyncMethod', arguments, function( err, res ){

          // Modifying what is returned by the original async method
          done( null, res + p1 );
        });
      },

    });

    // Create a Mixin class: a class that doesn't inherit from anything,
    // and just adds/redefines methods of the original class. Great for drivers!

    var Mixin = declare( null, {

      // Define the constructor. Will change `a` even more
      constructor: function( a ){

        console.log("Mixin's constructor run");

        this.a = this.a + 47;
      },

      // Redefine the assignB method
      assignB: function( b ){

        console.log( "Running assignB within mixin..." );

        // Call the original `assignB` method. Note that `this.b` will
        // be changed by this method
        var r = this.inherited( 'assignB', arguments);

        console.log( "The inherited assignB() method returned: " + r );

        // Return something completely different
        return 20000;
      },

      // Make up a new `assignC()` method
      assignC: function( c ){
        this.c = c;
      },

    });


     console.log("\nCreating baseObject:");
    var baseObject = new BaseClass( 10 );
    console.log( "BASE OBJECT:");
    console.log( baseObject );

     console.log("\nCreating derivedObject:");
    var derivedObject = new DerivedClass( 20 );
    derivedObject.assignB( 40 );
    console.log( "DERIVED OBJECT:");
    console.log( derivedObject );
    DerivedClass.classMethod();

     console.log("\nCreating mixedObject1:");
    var MixedClass1 = declare( [ BaseClass, Mixin ] );
    var mixedObject1 = new MixedClass1( 10 );
    mixedObject1.assignB( 50 );
    MixedClass1.classMethod();
    console.log( "MIXED OBJECT 1 (WITH BASE):");
    console.log( mixedObject1 );

     console.log("\nCreating mixedObject2:");
    var MixedClass2 = declare( [ DerivedClass, Mixin ] );
    var mixedObject2 = new MixedClass2( 10 );
    console.log( "MIXED OBJECT 2 (WITH DERIVED):");
    console.log( mixedObject2 );
    MixedClass2.classMethod();

    // DON'T! MixedClass3 inherits from MixedClass2 and Baseclass, but
    // MixedClass2 ALREADY inherits from Baseclass through DerivedClass!
    // Never inherits twice from the same class...
    // In this example, BaseClass' constructor in invoked TWICE.
     console.log("\nCreating mixedObject3 (the tangled one)")
    var MixedClass3 = declare( [ MixedClass2, BaseClass ] );
    var mixedObject3 = new MixedClass3( 10 );
    console.log( "MIXED OBJECT 3 (WITH TANGLED CLASSES):");
    console.log( mixedObject3 );

    MixedClass2.classMethod();

    console.log("\nAsync methods: ");

    // Async methods, main one and redefined one
    baseObject.asyncMethod( 3, 7, function( err, res ){
      if( err ){
        console.log("ERROR!");
        console.log( err );
      } else {
        console.log("Result of async method for baseObject:");
        console.log( res );

        derivedObject.asyncMethod( 3, 7, function( err, res ){
          if( err ){
            console.log("ERROR!");
            console.log( err );
          } else {
 
            console.log("Result of async method for derivedObject:");
            console.log( res );
          }
        });
      }
    });


* The function `this.inherited( 'assignB', arguments )` will call the constructor of the first matching class going up the chain, even if its direct parent doesn't implement that method. So, if class `A` defines `m()`, and class `B` inherits from `A`, and class `C` inherits from `B`, then `C` can call `this.inherited( 'assignB', arguments)` in `m()` and expect `A`'s `m()` to be called even if `B` doesn't implement `m()` at all. (You may need to read this sentence a couple of times before it makes perfect sense)


* Class methods are copied over from the parent to the child class. Parent methods are callable via `DerivedClass._super()`.

* Multiple inheritance is implemented by inheriting from each base class sequentially. Order matters.

* You can use `this.inherited('methodName', arguments )` (for sync method)  or `this.asyncInherited( 'asyncMethod', arguments, function( err, res ){` (for async methods) to call a method's parent.

# The problem it solves - little read for skeptics

Node.js provides a very basic function to implement classes that inherit from others: `util.inherits()`. This is hardly enough: code often ends up looking like this:

    function BaseClass( a ){
      this.a = a;
    }
    
    BaseClass.prototype.assignB = function(b){
      this.b = b;
    }
    
    function DerivedClass( a ){
    
      // Call the base class' constructor
      BaseClass.call( this, a );

      this.a ++; 
    }
    
    util.inherits( DerivedClass, BaseClass );
    
    DerivedClass.prototype.assignB = function( b ){
      BaseClass.prototype.assignB.call( this, b);
      this.b ++;
    }
    
    DerivedClass.prototype.assignC = function( c ){
      this.c = c;
    }

My problems with this code:

* It's unreadable. It's not clear, by reading it, what is what. It's easy enough here, but try to look at this code where there are several prototype functions and several inherited objects...

* The order in which you call `util.inherits()` matters -- a lot. You must remember to call it _before_ you define any custom prototypes

* Defining the prototype one by one by hand like that is hardly ideal

* You need to call the superclass' constructor by hand, manually

* If you want to call a parent's method from a child's method, you need to do so manually. If your parent doesn't implement that method, but the parent's parents do, you are out of luck.

* Multiple inheritance is... well, forget it.

* Mixin classes are... well, forget them.

The equivalent to the code above, which is also the example code provided, is:


    var BaseClass = declare( null, {

      constructor: function( a ){
        this.a = a;
      },

      assignB: function( b ){
        this.b = b;
      },
    });


    var DerivedClass = declare( BaseClass, {

      constructor: function( a ){
        this.a ++;
      },  

      assignB: function( b ){
        this.inherited( 'assignB', arguments );
        this.b ++;
      },

      assignC: function( c ){
        this.c = c;
      },

    });


Can you see the improvement? If so, you should use `simpleDeclare()`!


# LIMITATIONS:

Limitations won't be a problem if you keep things simple and don't mess with prototypes. Specifically:

  * If you change a method in a constructor's prototype, the `super` attribute of that method will be lost, and `this.inherited( 'methodName', arguments)` will no longer work.

  * If you inherit from a class multiple times, well, the class will be inherited several times (no dupe checking). This affects constructors (which will be called several times), inherited methods, etc. Basically, don't inherit twice from the same class.


