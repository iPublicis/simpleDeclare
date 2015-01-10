"use NONstrict";
/*
Copyright (C) 2015 Tony Mobily

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/


/*

  TODO:
    * CRUCIAL: Rewrite documentation
    * CRUCIAL: Write tests
    * PERFORMANCE: Add memoization to inherited()
    * PERFORMANCE: Get rid of forEach()es and use cycles instead
    * MAYBE: Place 'bases', 'ActualCtor', originalConstructor' in 'meta'
*/
var async = require('async');

// Note to self: I didn't think I would ever end up writing
// something like this. I wish super() was implemented in node.
// We will need to wait for ECMA 6... Ugh.
var inherited = function( type, args, cb ){

  // The real function that called this.inherited() is actually two levels up...
  var f = arguments.callee.caller.caller;

  // Look for the function itself in the object's prototypal hiherarchy 
  var currentPoint = this;
  var found;

  found = false;
  while( currentPoint ){

    var objMethods = Object.getOwnPropertyNames( currentPoint );
    for( var i = 0, l = objMethods.length; i < l; i ++ ){
      var k = objMethods[ i ];

      if( currentPoint.hasOwnProperty( k ) && currentPoint[ k ] === f ){
        found = true;
        break;
      }
    };
    // If found, break out of the cycle. Otherwise, keep looking in the next proto up
    if( found ) break;
    currentPoint = currentPoint.__proto__;
  }

  // If the function is not found anywhere in the prototype chain
  // there is a pretty big problem
  if( ! found ) throw new Error( "inherited coun't find method in chain -- "  + type );

  // At this point, I know the key. To look for the super method, I
  // only have to check if one of the parent __proto__ has a matching key `k`

  currentPoint = currentPoint.__proto__; // Starting from the one up
  found = false;
  while( currentPoint ){
    if( currentPoint.hasOwnProperty( k ) ){
      found = true;
      break;
    }
    currentPoint = currentPoint.__proto__;
  }

  // No inherited element in the chain, just call the callback (async) or return nothing
  if( ! found  ){
    if( type === 'async' ) return cb.call( this, null );            
    if( type === 'sync' ) return;
  }

  var fn = currentPoint[ k ];

  // Call the function. It could be sync or async
  if( type == 'async' ){
    var argsMinusCallback = Array.prototype.slice.call(args, 0, -1 ).concat( cb )
    return fn.apply( this, argsMinusCallback );
  } else {
    return fn.apply( this, args );
  }
};


// This will be added as a Constructor-wide method
// of constructor created with simpleDeclare (only if needed)
var extend = function( SuperCtor, protoMixin ){

  // Only one argument was passed and it's an object: it's protoMixin.
  // So, just return declare with `this` as base class and protoMixin
  if( arguments.length === 1 ){

    if( typeof( SuperCtor ) === 'object' && SuperCtor !== null ) return declare( [ this ], SuperCtor );
    else protoMixin = {};
  }
  
  // SuperCtor is is either a constructor function, or an array of constructor functions
  // Make up finalSuperCtorArray according to it.
  var finalSuperCtorArray = [ this ];  
  if( Array.isArray( SuperCtor ) ){  
    SuperCtor.forEach( function( Ctor ){ finalSuperCtorArray.push( Ctor ); } );
  } else if( typeof( SuperCtor ) === 'function' ) {
    finalSuperCtorArray.push( SuperCtor );
  } else {
    throw new Error( "SuperCtor parameter illegal in declare (via extend)");
  }

  return declare( finalSuperCtorArray, protoMixin );
}


// Look for Ctor.prototype anywhere in the __proto__ chain.
// Unlike Javascript's plain instanceof, this method attempts
// to compare 
var instanceOf = function( Ctor ){

  var searchedProto = Ctor.prototype;
  var current = this;
  var compare;

  while( current = current.__proto__){

    // It will compare either with originalConstructor.prototype or plain prototype
    compare = current.constructor.originalConstructor ?
              current.constructor.originalConstructor.prototype :
              current.constructor.prototype;         

    // Actually run the comparison
    if( compare === searchedProto ) return true;
  }
  return false;
}
  
var makeConstructor = function( FromCtor, protoMixin, SourceOfProto ){

  // The constructor that will get returned. It's basically a function
  // that calls the parent's constructor and then protoMixin.constructor.
  // It works with plain JS constructor functions (as long as they have,
  //  as they SHOULD, `prototype.constructor` set)
  var ReturnedCtor = function(){

    // Run the parent's constructor if present
    if( ReturnedCtor.prototype.__proto__ && ReturnedCtor.prototype.__proto__.constructor ){
      ReturnedCtor.prototype.__proto__.constructor.apply( this, arguments );
    }

    // If an actual constructor is set, it was placed in ReturnedCtor.ActialCtor.
    // If there is one, run it
    if( ReturnedCtor.hasOwnProperty( 'ActualCtor' ) ){
      ReturnedCtor.ActualCtor.apply( this, arguments );
    }
  
  };

  if( protoMixin === null ) protoMixin = {};
  if( typeof( protoMixin ) !== 'object' ) protoMixin = {};
  
  // Create the new function's prototype. It's a new object, which happens to
  // have its own prototype (__proto__) set as the superclass' prototype and the
  // `constructor` attribute set as FromCtor (the one we are about to return)

  ReturnedCtor.prototype = Object.create(FromCtor.prototype, {
    constructor: {
      value: ReturnedCtor,
      enumerable: false,
      writable: true,
      configurable: true
    },
  });

  // Copy every element in protoMixin into the prototype.
  // Note that `constructor` is special: it's _not_ copied over.
  // Instead, it's placed in ReturnedCtor.ActualCtor.
  // It can either come:
  //   * from protoMixin, in cases where SourceOfProto is not defined
  //     (which means that it's what the developer passed herself in `protoMixin` as `constructor`)
  //   * from the source of protoMixin, in cases where SourceOfProto is defined
  //     (which means that we are taking it from the SourceOfProto, since the goal
  //      is to mimic it completely creating a working copy of the original constructor)

  var ownProps = Object.getOwnPropertyNames( protoMixin );
  for( var i = 0, l = ownProps.length; i < l; i ++ ){
    var k = ownProps[ i ];

    if( k !== 'constructor' ) ReturnedCtor.prototype[ k ] = protoMixin[ k ];

    // ActualCtor comes from what the user placed as `constructor` as the second
    // parameter of `declare()`
    if( ! SourceOfProto && protoMixin.hasOwnProperty( 'constructor' ) ){
      ReturnedCtor.ActualCtor = protoMixin.constructor;
    }
  };
  // ActualCtor comes from the SourceOfProto, the constructor function we are
  // emulating
  // Basically if the parent class has `ActualCtor`, then the cloned one will also
  // definitely need it as the stock ReturnedCtor will look for it
  if( SourceOfProto ){
    if( SourceOfProto.hasOwnProperty('ActualCtor') ) ReturnedCtor.ActualCtor = SourceOfProto.ActualCtor;
  }

  // That's it!
  return ReturnedCtor;
}

var copyClassMethods = function( Source, Dest ){

  // Copy class methods over
  if( Source !== null && Source !== Object ){

    var ownProps = Object.getOwnPropertyNames( Source );
    ownProps.forEach( function( property ) {
      // It's one of the attriutes' in Function()'s prototype: skip
      if( Function.prototype[ property ] === Source[ property ] || property === 'prototype' ) return;
      // It's one of the attributes managed by simpleDeclare: skip
      if( [ 'ActualCtor', 'extend', 'originalConstructor' ].indexOf( property ) !== -1 ) return;
      Dest[ property ] = Source[ property ];
    });
  }
}

var declare = function( SuperCtorList, protoMixin ){

  var ResultClass;

  // Check that SuperCtorList is the right type
  if( SuperCtorList !== null && typeof( SuperCtorList ) !== 'function' && !Array.isArray( SuperCtorList ) ){
    throw new Error( "SuperCtor parameter illegal in declare");
  }

  // SuperCtor is null: the array will be an empty list
  if( SuperCtorList === null ) SuperCtorList = [];
  if( ! Array.isArray( SuperCtorList ) ) SuperCtorList = [ SuperCtorList ];

  // Set the starting point. It's either the first SuperCtor, or
  // Object
  var MixedClass = SuperCtorList[ 0 ] || Object;


  // Enrich MixedClass inheriting from itself, adding SuperCtor.prototype and
  // adding class methods

  // The class is inheriting from more than one class: it will go through
  // every __proto__ of every derivative class, and will augment MixedClass by
  // inheriting from each one of them
  for( var i = 1, l = SuperCtorList.length; i < l; i ++ ){
    var proto;

    proto = SuperCtorList[ i ].prototype;
    var list = [];
    while( proto ){
      list.push( proto );
      proto = proto.__proto__;
    };
    list.reverse().forEach( function( proto ){

      var M = MixedClass;

      if( proto.constructor !== Object ){

        MixedClass = makeConstructor( MixedClass, proto, proto.constructor );    

        copyClassMethods( M, MixedClass ); // Methods previously inherited
        copyClassMethods( proto.constructor, MixedClass ); // Extra methods from the father constructor

        // This will make this.instanceOf() work, and it will give us a link
        // to the constructor that actually originated this copy.
        // Note that copies of copies will still retain the original one
        MixedClass.originalConstructor = proto.constructor.hasOwnProperty( 'originalConstructor' ) ? proto.constructor.originalConstructor : proto.constructor;
      }
    })
  };

  // Finally, inherit from the MixedClass, and add
  // class methods over
  var ResultClass = makeConstructor( MixedClass, protoMixin );

  copyClassMethods( MixedClass, ResultClass );
  ResultClass.originalConstructor = ResultClass; // This will make this.instanceOf() work

  // Add inherited() and inheritedAsync() to the prototype
  // (only if they are not already there)
  if( ! ResultClass.prototype.inherited ) {
    ResultClass.prototype.inherited = function( args ){
      return inherited.call( this, 'sync', args );
    }
  }
  if( ! ResultClass.prototype.inheritedAsync ) {  
    ResultClass.prototype.inheritedAsync = function( args, cb ){
      return inherited.call( this, 'async', args, cb );
    }
  }

  // Add instanceOf
  if( ! ResultClass.prototype.instanceOf ) {    
    ResultClass.prototype.instanceOf = instanceOf;
  }

  // Add class-wide method `extend`
  ResultClass.extend = function( SuperCtor, protoMixin ){
    return extend.apply( this, arguments );
  }

  // That's it!
  return ResultClass;
};


// Returned extra: declarableObject
declare.extendableObject = declare( null );

exports = module.exports = declare;






    var A = declare( null, {

      name: 'A',

      constructor: function( p ){
        console.log("A's constructor called with parameter: " + p )
      },
 
      method1: function( parameter ){
        console.log("A::method1() called")
      },

      method2: function( parameter ){
        console.log("A::method2() called")
      },
    })

    var B = declare( A, {

      name: 'B',

      constructor: function( p ){
        console.log("B's constructor called with parameter: " + p )
      },
 
      method1: function( parameter ){
        console.log("B::method2() called");
      }
    })

    var a = new A( 10 ); // => A's constructor called with parameter: 10
    a.method1(); // => A::method1() called
    a.method2(); // => A::method2() called

    var b = new B( 11 );
    /* =>
    B's constructor called with parameter: 11
    A's constructor called with parameter: 11
    */

    b.method1(); // => B::method1() called

    console.log( a.__proto__ );
    /* =>
    { name: 'A',
      method1: [Function],
      method2: [Function],
      inherited: [Function],
      inheritedAsync: [Function],
      instanceOf: [Function] }
    */
    console.log( a.__proto__.__proto__ ); // => {}
    console.log( a.__proto__.__proto__.constructor === Object ); // true

    console.log( b.__proto__ ); // => { name: 'B', method1: [Function] }
    console.log( b.__proto__.__proto__ );
    /* =>
    { name: 'A',
      method1: [Function],
      method2: [Function],
      inherited: [Function],
      inheritedAsync: [Function],
      instanceOf: [Function] }
    */
    console.log( b.__proto__.__proto__.constructor === A ); // => true
    console.log( b.__proto__.__proto__.__proto__ ); // => {}
    console.log( b.__proto__.__proto__.__proto__.constructor === Object ); // => true 


//process.exit( 1 );


var P = declare.extendableObject.extend( { p: 10 });
debugger;



var A = declare( null, { name: 'A', constructor:function(){  console.log("A's constructor"); }  } );
var a = new A();
console.log( "a instanceof A: ", a instanceof A );
console.log( "a.instanceOf A: ", a.instanceOf( A ) );


var B = declare( A, { name: 'B', constructor:function(){  console.log("B's constructor"); } } );
var b = new B();

console.log("b's proto", b.__proto__);

console.log("b's proto's proto", b.__proto__.__proto__);

debugger;

console.log("b's proto's ActualCtor:", b.__proto__.constructor.ActualCtor ? b.__proto__.constructor.ActualCtor.toString() : "NONE" );
console.log("b's proto's proto's ActualCtor:", b.__proto__.__proto__.constructor.ActualCtor ? b.__proto__.__proto__.constructor.ActualCtor.toString() : "NONE");


//process.exit( 1 );
console.log( "b instanceof B: ", b instanceof B );
console.log( "b.instanceOf B: ", b.instanceOf( B ) );
console.log( "b instanceof A: ", b instanceof A );
console.log( "b.instanceOf A: ", b.instanceOf( A ) );


function inspectProto( o ){
  var r = [];

  var p = o;
  var name = 'OBJ';
  while( p != null ){
      r.push( p );
    //});
    p = p.__proto__;
  }

  r.reverse().forEach( function( item ){
    console.log( "\nITEM:" , item.hasOwnProperty( 'name') ? item.name : 'UNKNOWN' );
    Object.getOwnPropertyNames( item ).forEach( function( k ){
      var output;
      var e = item[ k ];

      //if( typeof( e ) === 'function') output = e.toString();
      output = e && typeof( e ) === 'function' ? '[function]'  : e;
      console.log( k + ': ' + output);
    });

  });
}


    // Create a BaseClass with a constructor, a method and a class method
    var BaseClass = declare( null, {

      // Define the constructor, will initialise `a`
      constructor: function( param ){

        console.log("BaseClass' constructor run");
        this.a = param; 
      },

      // Define a simple method, that will assign `b` and return 1000
      assignA: function( a ){
        console.log("AssignA run:", a );
        this.a = a;
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

    console.log("\nCreating baseObject:");
    var baseObject = new BaseClass( 10 );
    
    console.log( "BASE OBJECT:");
    console.log( baseObject );

    var r = baseObject.assignA( 30 );
    console.log("baseObject.assignA returned:", r );

    console.log( "BASE OBJECT:");
    console.log( baseObject );

    baseObject.asyncMethod( 3, 4, function( err, res ){
      console.log("Result from async method: "  + res );

      // Running classMethod()
      BaseClass.classMethod();
    });


console.log(".................................................");
console.log(".................................................");
console.log(".................................................");
console.log(".................................................");



   var Z1 = declare( null,{
     constructor: function(){ console.log("Z1 Constructor called"); },
     name: 'Z1',
     mm1: function( param, cb ){
        console.log("Z1::mm", param );
        console.log( "Z1::mm is returning 100");
        cb( null, 100 );
      }
   });

   var Z2 = declare( null,{
    init: function(){ console.log("Z2 Constructor called"); },

    name: 'Z2',
    constructor: function(){ console.log("Z2's constructor"); },

     mm2: function( param, cb ){
        console.log("Z2::mm", param );
        console.log( "Z2::mm is returning 101");
        cb( null, 101 );
      }
   });


   var Aa = declare( [ Z1 ], {
      constructor: function(){ console.log("Aa Constructor called"); },

      name: 'Aa',
      m: function( param, cb ){

        console.log("Aa::m", param );
        console.log( "Aa::m is returning 10");
        cb( null, 10 );
      },
    
    });


    // Note that B doesn't implement m()
    var Ba = declare( null, {
      constructor: function(){ console.log("Ba Constructor called"); },

      name: 'Ba',
      m: function( param, cb ){
        console.log("Ba::m", param );
        this.inheritedAsync( arguments, function( err, res ){
          console.log( "Parent returned: ", res );
          console.log( "Ba::m is returning 11");
          cb( null, 11 );
        });
      }
    } );

    var Ca = declare( null, {
      constructor: function(){ console.log("Ca Constructor called"); },
      name: 'Ca',
      m: function( param, cb ){
        console.log("Ca::m", param );
        this.inheritedAsync( arguments, function( err, res ){
          console.log( "Parent returned: ", res );
          console.log( "Ca::m is returning 12");
          cb( null, 12 );
        })
      }
    })

//    var a = new A();
//    var b = new B();
//    var c = new C();


var D = declare( [ Aa, Ba, Ca ], {
//var D = Aa.extend( [ Ba, Ca ], {

  constructor: function(){
    console.log("D1 Constructor called");
  },

  name: 'D',
  m: function( param, cb ){
    console.log("D::m", param );
    this.inheritedAsync( arguments, function( err, res ){
      console.log( "Parent returned: ", res );

    })
    console.log( "D::m is returning 15");
    cb( null, 15 );
  },

});



var d = new D();
d.name = "ME";
debugger;

//inspectProto( d );

console.log("TRUE?", d.instanceOf( Z2 ) ); 
console.log("TRUE?", d instanceof( Aa ) ); 


console.log("RUNNING d.m():");
d.m( "pippo", function( err, res ){
  console.log("returned: ", res );
});

//process.exit( 1 );



    var A = declare( null, {
      m: function( param ){

        console.log("A::m", param );
        console.log( "A::m is returning 10");
        return 10;
      },
      mm: function( param ){

        console.log("A::m", param );
        console.log( "A::m is returning 10");
        return 10;
      }

    });

    // Note that B doesn't implement m()
    var B = declare( [ A ] , {
      m: function( param ){
        console.log("B::m", param );
        console.log( "Parent returned: ", this.inherited( arguments) );
        console.log( "B::m is returning 11");
        return 11;
      }
    } );

    var C = declare( B, {
      m: function( param ){
        console.log("C::m", param );
        console.log( "Parent returned: ", this.inherited( arguments) );
        console.log( "C::m is returning 12");
        return 12;
      }
    })

//    var a = new A();
//    var b = new B();
//    var c = new C();


var D = declare([ A, B, C ]);
var d = new D();
console.log("RUNNING d.m():", d.m("pippo"));



console.log(".................................................");
console.log(".................................................");
console.log(".................................................");
console.log(".................................................");



console.log("Declare B1");
var B1 = declare( null, {

  name: 'B1',

  constructor: function(){
    console.log( "B1's constructor!") ;
  },

  m: function( parameter, cb ){
    console.log("B1 > m, parameter:", parameter );
    this.inheritedAsync( arguments, function( err, res ){
     console.log("RETURNED BY INHEDITEDASYNC (in B1): ", res );

      cb( null, 'Returned by B1' );
    });
  },

  mm: function( parameter){
    console.log("B1 > mm, parameter:", parameter );
  },
});

console.log("Declare B2");
var B2 = declare( null, {

  name: 'B2',

  constructor: function(){
    console.log( "B2's constructor!") ;
  },

  m: function( parameter, cb ){
    console.log("B2 > m, parameter: ", parameter );
    this.inheritedAsync( arguments, function( err, res ){

       console.log("RETURNED BY INHEDITEDASYNC (in B2): ", res );

      cb( null, 'Returned by B2' );
    });
  }
});

console.log("Declare B3");
var B3 = declare( null, {

  name: 'B3',
  constructor: function(){
    console.log( "B3's constructor!") ;
  },

  m: function( parameter, cb ){
    console.log("B3 > m, parameter: ", parameter );
    this.inheritedAsync( arguments, function( err, res ){

       console.log("RETURNED BY INHEDITEDASYNC (in B3): ", res );

      cb( null, 'Returned by B3' );
    });
  }
});


console.log( B1 );
console.log("DECLARING: D1" );
//var D1 = B1.extend( [ B2, B3 ], {
var D1 = declare( [ B1, B2, B3 ], {

  name: 'D1',

  constructor: function(){
    console.log( "D1's constructor!") ;
  },

  m: function( parameter, cb ){
    console.log("D1 > m, parameter:", parameter );
    this.inheritedAsync( arguments, function( err, res ){
     console.log("RETURNED IN INHEDITEDASYNC (in D1): ", res );

      cb( null, "Returned by D1");
    });
  },
})



console.log("Declaring D2");
var D2 = declare( [ D1 ] , {
  name: 'D2',

  m3: function(){
    console.log("D2 > m3!")
  },
  constructor: function(){
    console.log("D2?!?");
  },
})

console.log("D2 start:")
var d2 = new D2();
inspectProto( d2 );

console.log("D2 END:")


//var D = B.extend( [ A, A, A ] );

console.log("BEGIN");
var b1 = new B1();
var b2 = new B2();
var b3 = new B3();
console.log("END");


console.log("instanceof B1:", b1 instanceof( B1 ) );
console.log("RUNNING b1.m...");
b1.m( 'pippo', function( err, result ){
  console.log("b1.m WAS RUN!");
  console.log("Returned value:", result );


  var b2 = new B2();
  console.log("RUNNING b2.m...");
  b2.m( 'pluto', function( err, result ){
    console.log("b2.m WAS RUN!");
    console.log("Returned value:", result );


    var d1 = new D1();

    d1.m = function( parameter, cb ){
      console.log("REDEFINED D1 > m, parameter:", parameter );
      this.inheritedAsync( arguments, function( err, res ){
        console.log("RETURNED IN INHEDITEDASYNC (in D1 REDEFINED): ", res );

        cb( null, "Returned by D1 REDEFINED");
      });
    }


    console.log("instanceof B2:", d1 instanceof( B2 ) );
    console.log("instanceof B3:", d1 instanceof( B3 ) );
    console.log("instanceof D1:", d1 instanceof( D1 ) );
    console.log("RUNNING d1.m...");
    d1.m('parameterToD1', function( err, res ){
      console.log("Ah, it did it!", res );


      d1.m( 'paperino', function( err, result ){
        console.log("d1.m WAS RUN!")
        console.log("Returned value:", result );
      });

    })

  });
});



    var A = declare( null, {
      m: function( param ){

        console.log("A::m", param );
        console.log( "A::m is returning 10");
        return 10;
      }
    });

    // Note that B doesn't implement m()
    var B = declare( A, {
      m: function( param ){
        console.log("B::m", param );
        this.inherited( arguments );
        console.log( this.inherited( arguments) );
        console.log( "B::m is returning 11");
        return 11;
      }
    } );

    var C = declare( B, {
      m: function( param ){
        console.log("C::m", param );
        console.log( this.inherited( arguments) );
        console.log( "C::m is returning 12");
        return 12;
      }
    })

    var a = new A();
    var b = new B();
    var c = new C();

    c.m = function( param ){
      console.log("c1::m", param );
      console.log( this.inherited( arguments) );
      console.log( "c1::m is returning 12");
      return 12;
    };

    c.m = function( param ){
      console.log("c2::m", param );
      console.log( this.inherited( arguments) );
      console.log( "c2::m is returning 12");
      return 12;
    };

    console.log("Calling a.m()" );
    console.log( "Returned: ", a.m('pippo' ) );

    console.log("Calling c.m()" );
    console.log( "Returned: ", c.m('pluto' ) );

    var Aa = declare( null, {
      m: function( param, cb ){
        console.log("Aa::m", param );
        cb( null, 10 );
      }
    });

    var Ba = declare( Aa, {
      m: function( param, cb  ){
        console.log("Ba::m", param );
        this.inheritedAsync( arguments, function( err, res ){
          console.log("Super returns:", res );

          cb( null, 11 );
        })
      }
    });


    var Ca = declare( Ba, {
      m: function( param, cb  ){
        console.log("Ca::m", param );
        this.inheritedAsync( arguments, function( err, res ){
          console.log("Super returns:", res );

          cb( null, 12 );
        })
      }
    });
    
    var aa = new Aa();
    var ba = new Ba();
    var ca = new Ca();

    console.log("Calling aa.m()" );
    aa.m('pippo', function( err, r ){
      console.log("Result from pippo: ", r );

      console.log("Calling ca.m()" );
      ca.m('pluto', function( err, r ){
        console.log("Result from pluto: ", r );

      });
    });



    // Create a BaseClass with a constructor, a method and a class method
    var BaseClass = declare( null, {

      // Define the constructor, will initialise `a`
      constructor: function( param ){

        console.log("BaseClass' constructor run");
        this.a = param; 
      },

      // Define a simple method, that will assign `b` and return 1000
      assignA: function( a ){
        this.a = a;
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

    console.log("\nCreating baseObject:");
    var baseObject = new BaseClass( 10 );
    console.log( "BASE OBJECT:");
    console.log( baseObject );

    baseObject.asyncMethod( 3, 4, function( err, res ){
      console.log("Result from async method: "  + res );

      // Running classMethod()
      BaseClass.classMethod();
    });



    // Create a DerivedClass derived from BaseClass. It overloads the constructor
    // incrementing `a`. It also defines assignD()

    var DerivedClass = declare( BaseClass, {

      // Define the constructor. Note that this will be called _after_ BaseClass' constructor
      constructor: function( p ){

        console.log("DerivedClass' constructor run");
        this.a ++;
      },

     assignA: function assignA( a ){

        // Call the original `assignA` method.
        var r = this.inherited( arguments);
        console.log( "The inherited assignA() method returned: " + r );

        // Return something completely different
        return 20000;
     },

      // Define a new method to define `this.b`
      assignB: function( b ){
        this.b = b;
      },

      // Redefine BaseClass' `asyncMethod()` so that it considers `p1` twice
      // in the sum. To call the inherited async method, it uses `this.inheritedAsync()`
      asyncMethod: function asyncMethod( p1, p2, done ){
        this.inheritedAsync( arguments, function( err, res ){

          var newResult = res + p1;
          console.log("Returning this instead:", newResult );

          // Modifying what is returned by the original async method
          done( null, newResult );
        });
      },
    });

    console.log("\nCreating derivedObject:");
    var derivedObject = new DerivedClass( 20 );
    derivedObject.assignB( 40 );
    console.log( "DERIVED OBJECT:");
    console.log( derivedObject );
    DerivedClass.classMethod();

    console.log("\nAsync methods: ");

    // Async methods, main one and redefined one
    baseObject.asyncMethod( 3, 7, function( err, res ){
      if( err ){
        console.log("ERROR!", err );
      } else {
        console.log("Result of async method for baseObject:", res );

        console.log("Now calling asyncMethod for derived object...");

        derivedObject.asyncMethod( 3, 7, function( err, res ){
          if( err ){
            console.log("ERROR!", err );
          } else {
 
            console.log("Result of async method for derivedObject:", res );          }
        });
      }
    });




    // Create a Mixin class: a class that doesn't inherit from anything,
    // and just adds/redefines methods of the original class.

    var Mixin = declare( null, {

      // Define the constructor. Will change `a` even more
      constructor: function( p ){

        console.log("Mixin's constructor run");
        this.a = this.a + 47;
      },

      // Redefine the assignB method
      assignB: function( b ){

        console.log( "Running assignB within mixin..." );

        // Call the original `assignB` method. Note that the original
        // `assignB()` method will be called with a different parameter
        console.log("Calling the inherited assignB.")
        var r = this.inherited( arguments );
        console.log("Inherited assignB called, result:", r );

        this.b = 20000;
        console.log( "The inherited assignB() method returned: " + r );

        // Return b
        return this.b;
      },

      // Make up a new `assignC()` method
      assignC: function( c ){
        this.c = c;
      },
    });

    console.log("\nCreating mixedObject1:");
    var MixedClass1 = declare( [ BaseClass, Mixin ] );

    MixedClass1 = declare( [ MixedClass1, declare( null ), declare( null ) ]);


    var mixedObject1 = new MixedClass1( 10 );
    mixedObject1.assignB( 50 );
    MixedClass1.classMethod();
    console.log( "MIXED OBJECT 1 (WITH BASE):");
    console.log( mixedObject1 );

    console.log("\nCreating mixedObject2:");
    var MixedClass2 = declare( [ DerivedClass, Mixin ] );
    var mixedObject2 = new MixedClass2( 10 );
    mixedObject2.assignB( 50 );
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



var A = declare( null, {

  constructor: function(){
    console.log("A's constructor called");
  },

  m1: function( arg ){
    console.log("A > m, argument: ", arg );

    var i = this.inherited( arguments);
    console.log("Received this from inherited called by A:", i );

    return 'Returned by A > m';
  }
});

var AA = declare( A, {
  m2: function(){
    console.log("AA > m2");

  }
})

var aa = new AA();
console.log("aa instanceof AA:", aa instanceof AA );
console.log("aa instanceof A:", aa instanceof A );

var B = declare( null, {

  constructor: function(){
    console.log("B's constructor called");
  },

  m1: function( arg ){
    console.log("B > m, argument: ", arg );

    var i = this.inherited( arguments);
    console.log("Received this from inherited called by B:", i );

    return 'Returned by B > m';
  }
});

var C = declare( null, {

  constructor: function(){
    console.log("C's constructor called");
  },

  m1: function( arg ){
    console.log("C > m, argument: ", arg );

    var i = this.inherited( arguments);
    console.log("Received this from inherited called by C:", i );

    return 'Returned by C > m';
  }
});


var ABC = declare( [A,B,C], {
  m1: function( arg ){
    console.log("ABC > m, argument: ", arg );

    var i = this.inherited( arguments);
    console.log("Received this from inherited called by ABC:", i );

    return 'Returned by ABC > m';
  }
} );

var abc = new ABC();
var r = abc.m1( 'pippo');
console.log("RESULT:", r );


